import type { Database } from "bun:sqlite";

import { initDefaultConfig, loadConfig } from "../core/config/load-config";
import { logger } from "../core/logging/logger";
import { openDatabase } from "../db/client";
import { runIndex, scanProviders } from "../indexer/pipeline/indexer";

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
    const counts = {
      threads: Number((db.query("SELECT COUNT(*) AS count FROM threads").get() as Record<string, unknown>).count),
      messages: Number((db.query("SELECT COUNT(*) AS count FROM messages").get() as Record<string, unknown>).count),
      issues: Number((db.query("SELECT COUNT(*) AS count FROM parse_issues").get() as Record<string, unknown>).count),
      runs: Number((db.query("SELECT COUNT(*) AS count FROM index_runs").get() as Record<string, unknown>).count),
      lastRun:
        ((db.query("SELECT started_at, completed_at, status FROM index_runs ORDER BY started_at DESC LIMIT 1").get() as Record<
          string,
          unknown
        > | null) ?? null),
    };

    printJson(counts);
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

function renderHtmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f4f1ea; color: #1e1d1a; }
      main { max-width: 1000px; margin: 0 auto; padding: 32px; }
      h1 { margin: 0 0 16px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
      .card { background: #fffdf8; border: 1px solid #d9d1c4; border-radius: 12px; padding: 16px; }
      .muted { color: #666053; }
      table { width: 100%; border-collapse: collapse; background: #fffdf8; border-radius: 12px; overflow: hidden; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e6dece; font-size: 14px; }
      th { background: #f7f1e6; }
      code { font-family: ui-monospace, monospace; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

async function commandServe(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const db = await openDatabase(config.dbPath);

  const server = Bun.serve({
    hostname: config.server.host,
    port: config.server.port,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/stats") {
        const payload = {
          threads: Number((db.query("SELECT COUNT(*) AS count FROM threads").get() as Record<string, unknown>).count),
          messages: Number((db.query("SELECT COUNT(*) AS count FROM messages").get() as Record<string, unknown>).count),
          issues: Number((db.query("SELECT COUNT(*) AS count FROM parse_issues").get() as Record<string, unknown>).count),
        };

        return Response.json(payload);
      }

      const counts = {
        threads: Number((db.query("SELECT COUNT(*) AS count FROM threads").get() as Record<string, unknown>).count),
        messages: Number((db.query("SELECT COUNT(*) AS count FROM messages").get() as Record<string, unknown>).count),
        issues: Number((db.query("SELECT COUNT(*) AS count FROM parse_issues").get() as Record<string, unknown>).count),
        runs: Number((db.query("SELECT COUNT(*) AS count FROM index_runs").get() as Record<string, unknown>).count),
      };

      const rows = db.query(
        "SELECT title, provider_id, project_name, updated_at, status, message_count FROM threads ORDER BY updated_at DESC LIMIT 25",
      ).all() as Array<Record<string, unknown>>;

      const body = `
        <h1>Threaddy</h1>
        <p class="muted">Working server and CLI foundation. Reindex from the CLI, then refresh this page.</p>
        <div class="grid">
          <div class="card"><strong>${counts.threads}</strong><div class="muted">Threads</div></div>
          <div class="card"><strong>${counts.messages}</strong><div class="muted">Messages</div></div>
          <div class="card"><strong>${counts.issues}</strong><div class="muted">Issues</div></div>
          <div class="card"><strong>${counts.runs}</strong><div class="muted">Index runs</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Provider</th>
              <th>Project</th>
              <th>Updated</th>
              <th>Status</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length > 0
                ? rows
                    .map(
                      (row) => `
                <tr>
                  <td>${String(row.title ?? "(untitled)")}</td>
                  <td>${String(row.provider_id ?? "")}</td>
                  <td>${String(row.project_name ?? "")}</td>
                  <td>${String(row.updated_at ?? "")}</td>
                  <td>${String(row.status ?? "")}</td>
                  <td>${String(row.message_count ?? 0)}</td>
                </tr>`,
                    )
                    .join("")
                : '<tr><td colspan="6" class="muted">No indexed threads yet. Run <code>bun run src/main.ts reindex</code>.</td></tr>'
            }
          </tbody>
        </table>
      `;

      return new Response(renderHtmlPage("Threaddy", body), {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    },
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
