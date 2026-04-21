import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listThreads } from "../db/repos/query-service";
import { createTempDb } from "./helpers";

let db: Awaited<ReturnType<typeof createTempDb>>["db"];

beforeAll(async () => {
  ({ db } = await createTempDb());

  db.query(
    `INSERT INTO threads (
      id, provider_id, provider_thread_id, source_root_path, title, project_name, repo_path, cwd, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count, error_count, status, is_archived,
      summary, first_user_snippet, last_assistant_snippet, tags_json, capabilities_json, thread_flags_json, metadata_json,
      parser_version, last_indexed_at
    ) VALUES
      ('t1', 'codex', 'p1', '/codex', 'Auth fix', 'alpha', '/repo/alpha', '/repo/alpha', '2026-04-20', '2026-04-21T10:00:00Z', 10, 4, 4, 2, 0, 'ok', 0, 'Fix auth state', null, null, '[]', '{}', '{}', '{}', 1, '2026-04-21T10:00:00Z'),
      ('t2', 'cursor', 'p2', '/cursor', 'Cursor draft', 'beta', '/repo/beta', '/repo/beta', '2026-04-20', '2026-04-21T09:00:00Z', 0, 0, 0, 0, 0, 'partial', 0, 'Metadata only', null, null, '[]', '{}', '{}', '{}', 1, '2026-04-21T09:00:00Z'),
      ('t3', 'claude-code', 'p3', '/claude', 'Deploy plan', 'alpha', '/repo/alpha', '/repo/alpha', '2026-04-20', '2026-04-21T08:00:00Z', 3, 1, 1, 1, 0, 'ok', 0, 'Deployment checklist', null, null, '[]', '{}', '{}', '{}', 1, '2026-04-21T08:00:00Z')`,
  ).run();
});

afterAll(() => {
  db.close();
});

describe("listThreads", () => {
  test("filters by provider", () => {
    const result = listThreads(db, { provider: "cursor", project: null, status: null, q: null, page: 1, pageSize: 25 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("t2");
  });

  test("filters by project and text query", () => {
    const result = listThreads(db, { provider: null, project: "alpha", status: null, q: "Deploy", page: 1, pageSize: 25 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("t3");
  });

  test("paginates deterministically", () => {
    const result = listThreads(db, { provider: null, project: null, status: null, q: null, page: 2, pageSize: 25 });
    expect(result.page).toBe(2);
    expect(result.items.length).toBe(0);
  });
});
