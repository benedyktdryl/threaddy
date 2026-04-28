import type { Database } from "bun:sqlite";
import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";

import { logger } from "../core/logging/logger";
import type { AppConfig } from "../core/types/domain";
import { runIndex, scanProviders } from "./pipeline/indexer";

type SyncEvent =
  | { type: "idle" }
  | { type: "start" }
  | { type: "done"; newThreads: number }
  | { type: "error"; message: string };

export class SyncManager {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private running = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
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

  async startWatcher(): Promise<void> {
    const scan = await scanProviders(this.config);
    for (const result of scan) {
      for (const root of result.roots) {
        if (root.status !== "ok") continue;
        try {
          const w = watch(root.path, { recursive: true }, () => this.scheduleSync());
          this.watchers.push(w);
          logger.info("watcher_started", { dir: root.path });
        } catch (err) {
          logger.warn("watcher_failed", { dir: root.path, err });
        }
      }
    }
  }

  stopWatcher(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}
