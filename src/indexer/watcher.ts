import type { Database } from "bun:sqlite";
import { watch, existsSync } from "node:fs";
import type { FSWatcher } from "node:fs";
import { join } from "node:path";

import { logger } from "../core/logging/logger";
import type { AppConfig } from "../core/types/domain";
import { runIndex, scanProviders } from "./pipeline/indexer";
import { syncPins, pinWatchPaths } from "./pins/sync-pins";

type SyncEvent =
  | { type: "idle" }
  | { type: "start" }
  | { type: "done"; newThreads: number }
  | { type: "error"; message: string };

export class SyncManager {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private running = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pinDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watchers: FSWatcher[] = [];
  private encoder = new TextEncoder();

  constructor(
    private db: Database,
    private config: AppConfig,
  ) {}

  subscribe(): ReadableStream<Uint8Array> {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
        this.clients.add(c);
        this.sendTo(c, this.running ? { type: "start" } : { type: "idle" });
      },
      cancel: () => {
        this.clients.delete(controller);
      },
    });
    return stream;
  }

  private sendTo(controller: ReadableStreamDefaultController<Uint8Array>, event: SyncEvent): void {
    try {
      controller.enqueue(this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      this.clients.delete(controller);
    }
  }

  private broadcast(event: SyncEvent): void {
    const payload = this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const client of this.clients) {
      try {
        client.enqueue(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  async runSync(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.broadcast({ type: "start" });
    try {
      const summary = await runIndex(this.db, this.config);
      this.broadcast({ type: "done", newThreads: summary.threadsUpserted });
    } catch (err) {
      logger.error("sync_error", { err });
      this.broadcast({ type: "error", message: String(err) });
    } finally {
      this.running = false;
    }
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runSync(), this.config.watch.debounceMs);
  }

  // Pin state lives outside the transcript roots and changes cheaply, so we
  // refresh just the pins (no full reindex) when those files change.
  private schedulePinSync(): void {
    if (this.pinDebounceTimer) clearTimeout(this.pinDebounceTimer);
    // Pin-watch dirs churn on any app activity, so debounce more loosely than
    // transcripts — the actual pin set rarely changes.
    const delay = Math.max(this.config.watch.debounceMs, 3000);
    this.pinDebounceTimer = setTimeout(() => {
      try {
        syncPins(this.db);
      } catch (err) {
        logger.warn("pin_sync_failed", { err });
      }
    }, delay);
  }

  // The transcript watch directory for a root. Cursor's discovered root is the
  // whole (very churny) app-support dir, so narrow it to the one subdir that
  // actually holds conversation data.
  private transcriptWatchDir(providerId: string, rootPath: string): string {
    if (providerId === "cursor") {
      const narrowed = join(rootPath, "User", "globalStorage");
      if (existsSync(narrowed)) return narrowed;
    }
    return rootPath;
  }

  async startWatcher(): Promise<void> {
    // Transcript watchers — change → debounced full reindex (which re-syncs pins).
    const scan = await scanProviders(this.config);
    for (const result of scan) {
      for (const root of result.roots) {
        if (root.status !== "ok") continue;
        const dir = this.transcriptWatchDir(result.providerId, root.path);
        try {
          const w = watch(dir, { recursive: true }, () => this.scheduleSync());
          this.watchers.push(w);
          logger.info("watcher_started", { dir });
        } catch (err) {
          logger.warn("watcher_failed", { dir, err });
        }
      }
    }

    // Pin watchers — change → debounced pins-only sync.
    for (const target of pinWatchPaths()) {
      try {
        const w = watch(target.path, { recursive: target.recursive }, () => this.schedulePinSync());
        this.watchers.push(w);
        logger.info("pin_watcher_started", { dir: target.path });
      } catch (err) {
        logger.warn("pin_watcher_failed", { dir: target.path, err });
      }
    }
  }

  stopWatcher(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}
