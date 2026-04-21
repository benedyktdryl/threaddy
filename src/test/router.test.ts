import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createRouter } from "../app/server/router";
import { createTempDb, testConfig } from "./helpers";

let db: Awaited<ReturnType<typeof createTempDb>>["db"];
let dbPath: string;

beforeAll(async () => {
  const temp = await createTempDb();
  db = temp.db;
  dbPath = temp.dbPath;

  db.query(
    `INSERT INTO threads (
      id, provider_id, provider_thread_id, source_root_path, title, project_name, repo_path, cwd, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count, error_count, status, is_archived,
      summary, first_user_snippet, last_assistant_snippet, tags_json, capabilities_json, thread_flags_json, metadata_json,
      parser_version, last_indexed_at
    ) VALUES
      ('t1', 'codex', 'p1', '/codex', 'Auth fix', 'alpha', '/repo/alpha', '/repo/alpha', '2026-04-20', '2026-04-21T10:00:00Z', 10, 4, 4, 2, 0, 'ok', 0, 'Fix auth state', null, null, '[]', '{}', '{}', '{}', 1, '2026-04-21T10:00:00Z')`,
  ).run();
});

afterAll(() => {
  db.close();
});

describe("router actions", () => {
  test("provider pages render provider summaries", async () => {
    const router = createRouter(db, testConfig(dbPath));
    const response = await router(new Request("http://localhost/providers/codex", { redirect: "manual" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Provider");
  });

  test("save-filter action persists a saved filter", async () => {
    const router = createRouter(db, testConfig(dbPath));
    const body = new URLSearchParams({ href: "/threads?provider=codex", name: "Provider: codex" });
    const response = await router(
      new Request("http://localhost/actions/save-filter", {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(303);
    const row = db.query("SELECT name, href FROM saved_filters WHERE href = ?").get("/threads?provider=codex") as
      | Record<string, unknown>
      | null;
    expect(row?.name).toBe("Provider: codex");
  });

  test("rename-filter action updates an existing saved filter", async () => {
    db.query("INSERT INTO saved_filters (id, name, href, created_at) VALUES (?, ?, ?, ?)").run(
      "filter-1",
      "Old Name",
      "/threads?provider=cursor",
      "2026-04-21T10:00:00Z",
    );
    const router = createRouter(db, testConfig(dbPath));
    const body = new URLSearchParams({ name: "Renamed Filter", redirectTo: "/threads" });
    const response = await router(
      new Request("http://localhost/actions/saved-filters/filter-1/rename", {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(303);
    const row = db.query("SELECT name FROM saved_filters WHERE id = ?").get("filter-1") as Record<string, unknown> | null;
    expect(row?.name).toBe("Renamed Filter");
  });

  test("delete-filter action removes a saved filter", async () => {
    db.query("INSERT INTO saved_filters (id, name, href, created_at) VALUES (?, ?, ?, ?)").run(
      "filter-2",
      "Delete Me",
      "/threads?project=alpha",
      "2026-04-21T10:00:00Z",
    );
    const router = createRouter(db, testConfig(dbPath));
    const body = new URLSearchParams({ redirectTo: "/threads" });
    const response = await router(
      new Request("http://localhost/actions/saved-filters/filter-2/delete", {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        redirect: "manual",
      }),
    );

    expect(response.status).toBe(303);
    const row = db.query("SELECT id FROM saved_filters WHERE id = ?").get("filter-2");
    expect(row).toBeNull();
  });

  test("reindex action redirects after writing a run record", async () => {
    const router = createRouter(db, testConfig(dbPath));
    const before = Number((db.query("SELECT COUNT(*) AS count FROM index_runs").get() as Record<string, unknown>).count);

    const response = await router(new Request("http://localhost/actions/reindex", { method: "POST", redirect: "manual" }));

    const after = Number((db.query("SELECT COUNT(*) AS count FROM index_runs").get() as Record<string, unknown>).count);
    expect(response.status).toBe(303);
    expect(after).toBe(before + 1);
  });
});
