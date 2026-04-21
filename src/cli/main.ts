import type { Database } from "bun:sqlite";

import { initDefaultConfig, loadConfig } from "../core/config/load-config";
import { logger } from "../core/logging/logger";
import { openDatabase } from "../db/client";
import { getDashboardStats } from "../db/repos/query-service";
import { runIndex, scanProviders } from "../indexer/pipeline/indexer";
import { createRouter } from "../app/server/router";

function printHelp(): void {
  process.stdout.write(`threaddy commands:
  init
  scan [--json]
  reindex [providerId]
  stats
  doctor [--json]
  serve
`);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function withDb<T>(cwd: string, fn: (db: Database) => Promise<T>): Promise<T> {
  const config = await loadConfig(cwd);
  const db = await openDatabase(config.dbPath);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function commandInit(cwd: string): Promise<void> {
  const path = await initDefaultConfig(cwd);
  process.stdout.write(`Created config at ${path}\n`);
}

async function commandScan(cwd: string, asJson: boolean): Promise<void> {
  const config = await loadConfig(cwd);
  const result = await scanProviders(config);
  if (asJson) {
    printJson(result);
    return;
  }

  const summary = result.map((provider) => ({
    providerId: provider.providerId,
    roots: provider.roots,
    candidateCount: provider.candidates.length,
    samplePaths: provider.candidates.slice(0, 5).map((candidate) => candidate.path),
  }));
  printJson(summary);
}

async function commandReindex(cwd: string, providerId?: "codex" | "claude-code" | "cursor"): Promise<void> {
  const config = await loadConfig(cwd);
  const db = await openDatabase(config.dbPath);
  try {
    const summary = await runIndex(db, config, providerId);
    printJson(summary);
  } finally {
    db.close();
  }
}

async function commandStats(cwd: string): Promise<void> {
  await withDb(cwd, async (db) => {
    printJson(getDashboardStats(db));
  });
}

async function commandDoctor(cwd: string, asJson: boolean): Promise<void> {
  const config = await loadConfig(cwd);

  await withDb(cwd, async (db) => {
    const scan = await scanProviders(config);
    if (asJson) {
      const checks = {
        dbPath: config.dbPath,
        providers: scan,
        migrationsApplied: db
          .query("SELECT version, applied_at FROM schema_migrations ORDER BY version")
          .all() as Array<Record<string, unknown>>,
        counts: {
          threads: Number((db.query("SELECT COUNT(*) AS count FROM threads").get() as Record<string, unknown>).count),
          messages: Number((db.query("SELECT COUNT(*) AS count FROM messages").get() as Record<string, unknown>).count),
          issues: Number((db.query("SELECT COUNT(*) AS count FROM parse_issues").get() as Record<string, unknown>).count),
        },
      };
      printJson(checks);
      return;
    }

    const checks = {
      dbPath: config.dbPath,
      providers: scan.map((provider) => ({
        providerId: provider.providerId,
        roots: provider.roots,
        candidateCount: provider.candidates.length,
      })),
      migrationsApplied: db
        .query("SELECT version, applied_at FROM schema_migrations ORDER BY version")
        .all() as Array<Record<string, unknown>>,
      counts: {
        threads: Number((db.query("SELECT COUNT(*) AS count FROM threads").get() as Record<string, unknown>).count),
        messages: Number((db.query("SELECT COUNT(*) AS count FROM messages").get() as Record<string, unknown>).count),
        issues: Number((db.query("SELECT COUNT(*) AS count FROM parse_issues").get() as Record<string, unknown>).count),
      },
    };

    printJson(checks);
  });
}

async function commandServe(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const db = await openDatabase(config.dbPath);
  const router = createRouter(db, config);

  const server = Bun.serve({
    hostname: config.server.host,
    port: config.server.port,
    fetch: router,
  });

  logger.info("server_started", { url: server.url.toString() });
  process.stdout.write(`Server running at ${server.url}\n`);
}

export async function runCli(args: string[], cwd: string): Promise<void> {
  const [command, providerId, maybeFlag] = args;
  const asJson = providerId === "--json" || maybeFlag === "--json";

  switch (command) {
    case "init":
      await commandInit(cwd);
      return;
    case "scan":
      await commandScan(cwd, asJson);
      return;
    case "reindex":
      await commandReindex(
        cwd,
        providerId && !providerId.startsWith("--") ? (providerId as "codex" | "claude-code" | "cursor") : undefined,
      );
      return;
    case "stats":
      await commandStats(cwd);
      return;
    case "doctor":
      await commandDoctor(cwd, asJson);
      return;
    case "serve":
      await commandServe(cwd);
      return;
    default:
      printHelp();
  }
}
