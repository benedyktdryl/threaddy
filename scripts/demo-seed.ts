// Seed a synthetic Threaddy DB for screenshots / demos. Inserts realistic-
// looking-but-fake projects, threads, messages, and pins across all three
// providers. Pins are written with source='manual' so even if syncPins runs
// against this DB it won't overwrite them.
//
// Usage:   bun run scripts/demo-seed.ts
// Output:  /tmp/threaddy-demo.sqlite

import { existsSync, unlinkSync } from "node:fs";
import { openDatabase } from "../src/db/client";
import { stableId } from "../src/core/utils/ids";

const DB_PATH = process.env.THREADDY_DEMO_DB ?? "/tmp/threaddy-demo.sqlite";
if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

const db = await openDatabase(DB_PATH);

db.exec(
  `INSERT OR REPLACE INTO providers (id, name, is_enabled) VALUES
     ('codex','Codex',1),('claude-code','Claude Code',1),('cursor','Cursor',1)`,
);

const PROJECTS = [
  "acme-portal",
  "north-star",
  "ledger-rewrite",
  "route-planner",
  "marketing-site",
  "demo-cli",
  "billing-service",
  "intranet-admin",
];

const TITLES = [
  "Refactor authentication middleware to JWT",
  "Implement bulk CSV importer with progress",
  "Debug intermittent CI failures on macOS runners",
  "Add dark mode toggle with theme provider",
  "Migrate from Webpack 4 to Vite 5",
  "Set up GitHub Actions for monorepo",
  "Fix flaky integration tests in checkout flow",
  "Build admin dashboard with role-based access",
  "Optimize dashboard SQL queries",
  "Implement WebSocket reconnection logic",
  "Add Stripe Connect for marketplace payouts",
  "Write Terraform modules for VPC peering",
  "Generate OpenAPI spec from Zod schemas",
  "Configure Datadog alerts for payment latency",
  "Document deployment runbook",
  "Rewrite event processor for high throughput",
  "Add OAuth2 sign-in via Google",
  "Implement audit log middleware",
  "Profile and fix N+1 queries in invoices",
  "Add CSV export to admin reports",
  "Set up Prisma schema for billing module",
  "Build pricing page with feature comparison",
  "Implement file upload with S3 presigned URLs",
  "Add multi-tenant subdomain routing",
  "Wire up Sentry source maps in CI",
  "Migrate legacy enums to discriminated unions",
  "Add canary deployments via feature flags",
  "Build email template editor with MJML",
  "Implement OTP-based magic link login",
  "Add retry with exponential backoff to webhooks",
];

const PREVIEWS = [
  "Looking at the current auth flow we mint a JWT on /login but the refresh path doesn't rotate the refresh token, which leaves a stale access token valid for 15 minutes after rotation. Let's sketch a fix.",
  "When uploading large CSVs the request times out at the load balancer. Plan: stream-parse with papaparse, stage rows in a temp table, and report progress to the browser over SSE.",
  "The macOS GitHub runner fails ~1 in 20 builds with EADDRINUSE on the test port. Switching to port 0 and reading back the bound port should eliminate the race.",
  "Hydration mismatch on dark mode toggle: server renders 'light' but the client immediately flips. Read prefers-color-scheme on the server, inline a class on <html>, and let the toggle override.",
  "Vite migration inventory: file-loader -> built-in, ts-loader -> esbuild, raw-loader -> ?raw, less-loader -> still needed. CSS modules will need a tweak to the import suffix.",
  "Turbo-based workflow that detects affected packages and only runs lint+test+build for those. Pair with a path filter so docs-only PRs skip CI.",
  "Two slow queries on /dashboard: an unindexed timestamp range scan and an accidental cartesian on org members. Adding (org_id, created_at) and an EXISTS rewrite drops it from 1.8s to 40ms.",
  "WebSocket reconnect loop: detect close, exponential backoff capped at 30s, restore subscriptions, and replay the buffered outbound queue. Need to handle the 'identity changed' case after a long disconnect.",
];

const PROVIDERS = ["claude-code", "codex", "cursor"] as const;
const COUNTS: Record<string, number> = { "claude-code": 12, codex: 10, cursor: 8 };

const now = Date.now();
let titleIdx = 0;
let projIdx = 0;
let updIdx = 0;
const allIds: Array<{ id: string; provider: string; providerThreadId: string }> = [];

const insertThread = db.prepare(
  `INSERT INTO threads (
     id, provider_id, provider_thread_id, source_root_path, title, project_name, repo_path, cwd,
     created_at, updated_at,
     message_count, user_message_count, assistant_message_count, tool_call_count, error_count,
     status, is_archived,
     summary, initial_prompt, initial_prompt_preview, first_user_snippet, last_assistant_snippet,
     title_source, initial_prompt_source, tags_json, capabilities_json, thread_flags_json, metadata_json,
     parser_version, last_indexed_at
   ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const insertMessage = db.prepare(
  `INSERT INTO messages (id, thread_id, ordinal, role, kind, created_at, content_text, content_preview,
                        tool_name, tool_call_id, source_message_id, source_path, source_offset, parse_status)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const ROLES_TEMPLATE: Array<{ role: string; kind: string; text: string; toolName?: string }> = [
  { role: "user", kind: "chat", text: "" }, // filled with the thread preview
  {
    role: "assistant",
    kind: "chat",
    text: "Good call. Let me check the existing implementation, sketch a small migration, and confirm it doesn't break the existing test harness.",
  },
  { role: "tool", kind: "tool_call", text: "{\"path\":\"src/auth/middleware.ts\"}", toolName: "read_file" },
  {
    role: "assistant",
    kind: "chat",
    text: "Here's the relevant section. The refresh handler doesn't rotate the refresh token after issuing a new access token, so the old refresh token stays valid until natural expiry.",
  },
  { role: "user", kind: "chat", text: "Right. Let's rotate it and add a test that the previous refresh token can no longer mint a new access token." },
  {
    role: "assistant",
    kind: "chat",
    text: "Done — patch applied, two tests added (rotation invalidates old refresh + new refresh works once). All green locally.",
  },
];

for (const provider of PROVIDERS) {
  const count = COUNTS[provider];
  for (let n = 0; n < count; n++) {
    const project = PROJECTS[projIdx++ % PROJECTS.length];
    const title = TITLES[titleIdx++ % TITLES.length];
    const preview = PREVIEWS[(titleIdx + 1) % PREVIEWS.length];
    const providerThreadId = crypto.randomUUID();
    const id = stableId([provider, providerThreadId]);
    // Stagger updates so the list looks naturally interleaved
    const minutesAgo = updIdx++ * 73 + 5;
    const updatedAt = new Date(now - minutesAgo * 60_000).toISOString();
    const createdAt = new Date(now - (minutesAgo + 30) * 60_000).toISOString();

    insertThread.run(
      id, provider, providerThreadId, `/fake/${provider}/root`, title, project,
      `/Users/demo/projects/${project}`, `/Users/demo/projects/${project}`, createdAt, updatedAt,
      ROLES_TEMPLATE.length, 2, 3, 1, 0, "ok", 0,
      preview.slice(0, 220), preview, preview, preview,
      "Patch applied and tests green. Let me know if you want me to split this into a couple of PRs.",
      "derived:initial_prompt", "derived", "[]", '{"messages":true}', "{}", "{}", 1, new Date().toISOString(),
    );

    for (let o = 0; o < ROLES_TEMPLATE.length; o++) {
      const tpl = ROLES_TEMPLATE[o];
      const text = o === 0 ? preview : tpl.text;
      insertMessage.run(
        `${id}-${o}`, id, o, tpl.role, tpl.kind,
        new Date(now - (minutesAgo + 30 - o * 2) * 60_000).toISOString(),
        text, text.slice(0, 220), tpl.toolName ?? null, null, null,
        `/fake/${provider}/transcript.jsonl`, o, "ok",
      );
    }

    allIds.push({ id, provider, providerThreadId });
  }
}

// Pin 5 threads, one of each provider plus two extras, ordered so the
// Pinned section reads nicely. source='manual' makes them survive syncPins.
const pickByProvider = (p: string) => allIds.find((t) => t.provider === p)!;
const pinned = [
  pickByProvider("codex"),
  pickByProvider("claude-code"),
  pickByProvider("cursor"),
  allIds[5],
  allIds[14],
];
const insertPin = db.prepare(
  "INSERT INTO thread_pins (provider_id, provider_thread_id, source, pinned_at) VALUES (?,?,?,?)",
);
const pinTime = new Date().toISOString();
for (const t of pinned) insertPin.run(t.provider, t.providerThreadId, "manual", pinTime);

// Record a couple of completed index runs so the Index Runs page isn't empty.
const runInsert = db.prepare(
  `INSERT INTO index_runs (id, started_at, completed_at, status, providers_json, roots_scanned,
                           files_seen, files_changed, threads_upserted, messages_upserted, errors, notes)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
);
for (let i = 0; i < 4; i++) {
  const startedAt = new Date(now - i * 6 * 3600_000).toISOString();
  const completedAt = new Date(now - i * 6 * 3600_000 + 4000).toISOString();
  runInsert.run(crypto.randomUUID(), startedAt, completedAt, "ok",
    JSON.stringify(["claude-code", "codex", "cursor"]),
    6, 312, i === 0 ? 4 : 0, allIds.length, 750, 0, null);
}

console.log("threads:", db.query("SELECT COUNT(*) c FROM threads").get());
console.log("pins:",    db.query("SELECT COUNT(*) c FROM thread_pins").get());
console.log("messages:", db.query("SELECT COUNT(*) c FROM messages").get());
console.log("db at:", DB_PATH);
db.close();
