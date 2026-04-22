import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CandidateSource } from "../core/types/domain";
import { claudeCodeAdapter } from "../providers/claude-code/index";
import { codexAdapter } from "../providers/codex/index";
import { cursorAdapter } from "../providers/cursor/index";

const originalHome = process.env.HOME;

afterEach(() => {
  process.env.HOME = originalHome;
});

function candidate(path: string, sourceRootPath: string, type: "jsonl" | "sqlite"): CandidateSource {
  return {
    providerId: type === "sqlite" ? "cursor" : path.includes(".claude") ? "claude-code" : "codex",
    sourceRootPath,
    path,
    type,
    size: 0,
    mtimeMs: Date.now(),
  };
}

describe("provider normalization", () => {
  test("codex extracts fallback title and prompt from JSONL events", async () => {
    const root = await mkdtemp(join(tmpdir(), "threaddy-codex-root-"));
    const sessionsDir = join(root, "2026", "04", "22");
    await mkdir(sessionsDir, { recursive: true });
    const threadId = "123e4567-e89b-12d3-a456-426614174000";
    const rolloutPath = join(sessionsDir, `rollout-2026-04-22T09-00-00-${threadId}.jsonl`);
    await writeFile(
      rolloutPath,
      [
        JSON.stringify({ timestamp: "2026-04-22T09:00:00.000Z", type: "session_meta", payload: { id: threadId, cwd: "/tmp/project" } }),
        JSON.stringify({ timestamp: "2026-04-22T09:00:01.000Z", type: "event_msg", payload: { type: "user_message", message: "Raw prompt wrapper" } }),
        JSON.stringify({
          timestamp: "2026-04-22T09:00:02.000Z",
          type: "event_msg",
          payload: { type: "thread_name_updated", thread_name: "JSONL Title" },
        }),
      ].join("\n"),
    );

    const [bundle] = await codexAdapter.parse(candidate(rolloutPath, root, "jsonl"));
    expect(bundle.title).toBe("JSONL Title");
    expect(bundle.initialPrompt).toBe("Raw prompt wrapper");
    expect(bundle.initialPromptSource).toBe("codex-jsonl:user_message");
  });

  test("claude uses custom title and first root user prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "threaddy-claude-root-"));
    const filePath = join(root, "session.jsonl");
    await writeFile(
      filePath,
      [
        JSON.stringify({ type: "queue-operation", operation: "enqueue", sessionId: "s1", content: "queue content" }),
        JSON.stringify({
          type: "user",
          sessionId: "s1",
          parentUuid: null,
          isSidechain: false,
          message: { role: "user", content: "Original root prompt" },
        }),
        JSON.stringify({ type: "ai-title", sessionId: "s1", aiTitle: "AI Title" }),
        JSON.stringify({ type: "custom-title", sessionId: "s1", customTitle: "Custom Title" }),
        JSON.stringify({
          type: "assistant",
          sessionId: "s1",
          timestamp: "2026-04-22T09:00:03.000Z",
          message: { role: "assistant", content: [{ type: "text", text: "Answer" }] },
        }),
      ].join("\n"),
    );

    const [bundle] = await claudeCodeAdapter.parse(candidate(filePath, root, "jsonl"));
    expect(bundle.title).toBe("Custom Title");
    expect(bundle.initialPrompt).toBe("Original root prompt");
    expect(bundle.initialPromptSource).toBe("claude:root-user");
  });

  test("cursor extracts first bubble prompt and skips draft and empty composers", async () => {
    const root = await mkdtemp(join(tmpdir(), "threaddy-cursor-root-"));
    const globalStorage = join(root, "User", "globalStorage");
    await mkdir(globalStorage, { recursive: true });
    const dbPath = join(globalStorage, "state.vscdb");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);");
    db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);");
    db.query("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
      "composer.composerHeaders",
      JSON.stringify({
        allComposers: [
          {
            composerId: "valid-1",
            name: "Cursor Title",
            subtitle: "Edited file.ts",
            createdAt: 1,
            lastUpdatedAt: 2,
            workspaceIdentifier: { id: "ws-1", uri: { fsPath: "/tmp/project" } },
          },
          {
            composerId: "draft-1",
            isDraft: true,
            createdAt: 1,
            lastUpdatedAt: 2,
            workspaceIdentifier: { id: "ws-1", uri: { fsPath: "/tmp/project" } },
          },
          {
            composerId: "empty-1",
            createdAt: 1,
            lastUpdatedAt: 2,
            workspaceIdentifier: { id: "ws-1", uri: { fsPath: "/tmp/project" } },
          },
        ],
      }),
    );
    db.query("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run(
      "composerData:valid-1",
      JSON.stringify({ fullConversationHeadersOnly: [{ bubbleId: "bubble-1", type: 1 }] }),
    );
    db.query("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run(
      "bubbleId:valid-1:bubble-1",
      JSON.stringify({ text: "First cursor prompt" }),
    );
    db.query("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run("composerData:empty-1", JSON.stringify({ fullConversationHeadersOnly: [] }));
    db.close();

    const bundles = await cursorAdapter.parse(candidate(dbPath, root, "sqlite"));
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.title).toBe("Cursor Title");
    expect(bundles[0]?.initialPrompt).toBe("First cursor prompt");
    expect(bundles[0]?.initialPromptSource).toBe("cursor:cursorDiskKV:first-bubble");
  });
});
