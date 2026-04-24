import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../core/types/domain";
import { openDatabase } from "../db/client";

export async function createTempDb() {
  const dir = await mkdtemp(join(tmpdir(), "threaddy-test-"));
  const dbPath = join(dir, "index.sqlite");
  const db = await openDatabase(dbPath);
  return { dir, dbPath, db };
}

export function testConfig(dbPath: string): AppConfig {
  return {
    dbPath,
    server: { host: "127.0.0.1", port: 4821 },
    providers: {
      codex: { enabled: false, roots: [] },
      claudeCode: { enabled: false, roots: [] },
      cursor: { enabled: false, roots: [] },
    },
    indexing: {
      messageFts: false,
      batchSize: 250,
      maxPreviewLength: 600,
    },
    watch: {
      enabled: false,
      debounceMs: 1000,
    },
    excludes: [],
    semanticSearch: {
      enabled: false,
      model: "Xenova/all-MiniLM-L6-v2",
      chunkSize: 800,
      chunkOverlap: 120,
      enableFts: true,
      mode: "hybrid",
    },
  };
}
