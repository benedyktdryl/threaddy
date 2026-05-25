// Imports "pinned"/"starred" conversation state from each provider's own
// storage and mirrors it into the thread_pins table. Run on every index pass.
//
// Join key per provider is (provider_id, provider_thread_id):
//   - codex:       ~/.codex/.codex-global-state.json -> "pinned-thread-ids" (thread UUIDs)
//   - cursor:      <Cursor>/User/workspaceStorage/**/state.vscdb -> ItemTable
//                  "cursor/pinnedComposers" (composerIds)
//   - claude-code: Claude desktop app, 2-hop:
//                  IndexedDB leveldb -> {"state":{"starredIds":["local_<uuid>",...]},...,"updatedAt"}
//                  then claude-code-sessions/**/local_<uuid>.json -> "cliSessionId"
//
// Every reader is best-effort: missing files / uninstalled apps yield [] rather
// than throwing, so indexing never fails because a provider app isn't present.

import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Glob } from "bun";

import type { ProviderId } from "../../core/types/domain";
import { logger } from "../../core/logging/logger";

export interface ProviderPin {
  providerId: ProviderId;
  providerThreadId: string;
}

/**
 * Filesystem locations that hold provider pin state, for a lightweight watcher.
 * A change here should trigger syncPins() only (not a full reindex). `recursive`
 * is false for the Codex dir so we don't double-watch ~/.codex/sessions.
 */
export function pinWatchPaths(): Array<{ path: string; recursive: boolean }> {
  return [
    { path: join(homedir(), ".codex"), recursive: false },
    { path: join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage"), recursive: true },
    {
      path: join(homedir(), "Library", "Application Support", "Claude", "IndexedDB", "https_claude.ai_0.indexeddb.leveldb"),
      recursive: true,
    },
  ].filter((t) => existsSync(t.path));
}

function readCodexPins(): ProviderPin[] {
  const path = join(homedir(), ".codex", ".codex-global-state.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { "pinned-thread-ids"?: unknown };
    const ids = data["pinned-thread-ids"];
    if (!Array.isArray(ids)) return [];
    return ids
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({ providerId: "codex" as ProviderId, providerThreadId: id }));
  } catch (error) {
    logger.info("pins_codex_read_failed", { error: String(error) });
    return [];
  }
}

function readCursorPins(): ProviderPin[] {
  const base = join(homedir(), "Library", "Application Support", "Cursor", "User");
  const dbPaths = [
    join(base, "globalStorage", "state.vscdb"),
    // The global pinned list lives in the "empty-window" workspace; scan all
    // workspace stores so per-window pins are picked up too.
    ...safeGlob("workspaceStorage/*/state.vscdb", base),
  ];

  const composerIds = new Set<string>();
  for (const dbPath of dbPaths) {
    if (!existsSync(dbPath)) continue;
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .query("SELECT value FROM ItemTable WHERE key = 'cursor/pinnedComposers'")
        .get() as { value?: unknown } | null;
      db.close();
      if (!row?.value) continue;
      const parsed = JSON.parse(String(row.value)) as unknown;
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === "string" && id) composerIds.add(id);
      }
    } catch (error) {
      logger.info("pins_cursor_read_failed", { dbPath, error: String(error) });
    }
  }

  return [...composerIds].map((id) => ({ providerId: "cursor" as ProviderId, providerThreadId: id }));
}

function readClaudeCodePins(): ProviderPin[] {
  const claudeDir = join(homedir(), "Library", "Application Support", "Claude");
  const idbDir = join(claudeDir, "IndexedDB", "https_claude.ai_0.indexeddb.leveldb");
  if (!existsSync(idbDir)) return [];

  // 1) Find the most recent starredIds blob across all leveldb segment files.
  //    Chromium leveldb isn't trivially parseable, but the value is stored as a
  //    plain zustand-persist JSON blob, so we scan the raw bytes for it.
  let latestStarred: string[] = [];
  let latestUpdatedAt = -1;
  const blobRe = /\{"state":\{"starredIds":(\[[^\]]*\])\},"version":\d+,"updatedAt":(\d+)\}/g;

  try {
    for (const file of readdirSync(idbDir)) {
      if (!/\.(ldb|log)$/.test(file)) continue;
      const text = readFileSync(join(idbDir, file), "latin1");
      for (const match of text.matchAll(blobRe)) {
        const updatedAt = Number(match[2]);
        if (updatedAt <= latestUpdatedAt) continue;
        try {
          const ids = JSON.parse(match[1]) as unknown;
          if (Array.isArray(ids)) {
            latestStarred = ids.filter((id): id is string => typeof id === "string");
            latestUpdatedAt = updatedAt;
          }
        } catch {
          // ignore malformed blob
        }
      }
    }
  } catch (error) {
    logger.info("pins_claude_idb_read_failed", { error: String(error) });
    return [];
  }

  if (latestStarred.length === 0) return [];

  // 2) Resolve each local_<uuid> -> its cliSessionId (== ~/.claude/projects jsonl
  //    filename == claude-code provider_thread_id).
  const sessionsDir = join(claudeDir, "claude-code-sessions");
  const pins: ProviderPin[] = [];
  for (const starredId of latestStarred) {
    const sessionFiles = safeGlob(`**/${starredId}.json`, sessionsDir);
    for (const file of sessionFiles) {
      try {
        const data = JSON.parse(readFileSync(file, "utf8")) as { cliSessionId?: unknown };
        if (typeof data.cliSessionId === "string" && data.cliSessionId) {
          pins.push({ providerId: "claude-code", providerThreadId: data.cliSessionId });
        }
      } catch {
        // ignore unreadable session file
      }
      break; // first match is enough
    }
  }
  return pins;
}

function safeGlob(pattern: string, cwd: string): string[] {
  if (!existsSync(cwd)) return [];
  try {
    return [...new Glob(pattern).scanSync({ cwd, absolute: true })];
  } catch {
    return [];
  }
}

const PROVIDER_PIN_READERS: Record<string, () => ProviderPin[]> = {
  codex: readCodexPins,
  cursor: readCursorPins,
  "claude-code": readClaudeCodePins,
};

// Signature of the last imported pin set. The pin-watch directories (Cursor
// workspaceStorage, Claude IndexedDB) churn on any app activity, so syncPins is
// called very frequently; when the actual pins haven't changed we skip the DB
// write and the log line entirely.
let lastSignature: string | null = null;

/**
 * Refresh provider-sourced pins in the thread_pins table. For each provider we
 * delete its existing rows and re-insert the current set, so unpinning in the
 * source app is reflected. Manual (source='manual') pins are never touched.
 * No-op (besides cheap file reads) when the pin set is unchanged.
 */
export function syncPins(db: Database): { imported: number; changed: boolean } {
  const collected = Object.entries(PROVIDER_PIN_READERS).map(([source, read]) => ({ source, pins: read() }));

  const signature = collected
    .flatMap(({ source, pins }) => pins.map((p) => `${source} ${p.providerId} ${p.providerThreadId}`))
    .sort()
    .join("\n");
  const imported = collected.reduce((n, c) => n + c.pins.length, 0);

  if (signature === lastSignature) {
    return { imported, changed: false };
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const del = db.query("DELETE FROM thread_pins WHERE source = ?");
    const ins = db.query(
      "INSERT OR IGNORE INTO thread_pins (provider_id, provider_thread_id, source, pinned_at) VALUES (?, ?, ?, ?)",
    );
    for (const { source, pins } of collected) {
      del.run(source);
      for (const pin of pins) ins.run(pin.providerId, pin.providerThreadId, source, now);
    }
  });
  tx();

  lastSignature = signature;
  logger.info("pins_synced", { imported });
  return { imported, changed: true };
}
