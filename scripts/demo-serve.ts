// Serve a demo Threaddy instance against a synthetic DB for screenshots.
// Crucially: no SyncManager, no watcher, no syncPins -- so neither this user's
// real provider data nor real pins are touched. All providers are flagged
// disabled so even an accidental reindex would be a no-op.
//
// Usage:   bun run scripts/demo-serve.ts
//   env:   THREADDY_DEMO_DB   default /tmp/threaddy-demo.sqlite
//          THREADDY_DEMO_PORT default 4821

import { createRouter } from "../src/app/server/router";
import { openDatabase } from "../src/db/client";
import type { AppConfig } from "../src/core/types/domain";

const DB_PATH = process.env.THREADDY_DEMO_DB ?? "/tmp/threaddy-demo.sqlite";
const PORT = Number(process.env.THREADDY_DEMO_PORT ?? "4821");

const db = await openDatabase(DB_PATH);

const config: AppConfig = {
  dbPath: DB_PATH,
  server: { host: "127.0.0.1", port: PORT },
  providers: {
    codex:      { enabled: false, roots: [] },
    claudeCode: { enabled: false, roots: [] },
    cursor:     { enabled: false, roots: [] },
  },
  indexing: { messageFts: false, batchSize: 250, maxPreviewLength: 600 },
  watch: { enabled: false, debounceMs: 1000 },
  excludes: [],
  semanticSearch: {
    enabled: false,
    model: "Xenova/all-MiniLM-L6-v2",
    chunkSize: 800,
    chunkOverlap: 120,
    enableFts: false,
    mode: "keyword",
  },
};

const router = createRouter(db, config, process.cwd());
const server = Bun.serve({ hostname: "127.0.0.1", port: PORT, fetch: router });
process.stdout.write(`demo serving at ${server.url}\n`);
