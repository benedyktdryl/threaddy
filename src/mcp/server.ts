// Threaddy MCP server.
//
// Four small tools that expose the aggregated archive of past Codex / Cursor /
// Claude Code conversations to any MCP-compatible agent:
//   - search_threads — hybrid/keyword/semantic search across all providers
//   - get_thread     — full message timeline for one thread (paginated)
//   - list_pinned    — user-pinned threads (imported from each provider's app)
//   - find_related   — semantically similar threads (reuses stored embeddings)
//
// Design rules:
//   - Every result that names a thread also carries `openInApp` (deep link to
//     the source app, see core/links/deep-link.ts). null for unsupported
//     providers (Cursor).
//   - Snippets only by default. Full message text must be opted into via
//     `get_thread(..., includeFullContent=true)` to avoid token blow-ups.
//   - DB is opened in WAL mode upstream, so this readonly process coexists
//     with the running `serve` writer.

import type { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import type { AppConfig } from "../core/types/domain";
import { providerDeepLinkUrl } from "../core/links/deep-link";
import { hybridSearch } from "../semantic-search/retrieval/hybrid-search";
import { getRelatedThreads } from "../semantic-search/retrieval/semantic-search";
import type { SearchMode } from "../semantic-search/types/index";

const SNIPPET_MAX = 280;
const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 50;
const PINNED_LIMIT_DEFAULT = 50;
const PINNED_LIMIT_MAX = 100;
const RELATED_LIMIT_DEFAULT = 5;
const RELATED_LIMIT_MAX = 20;
const MESSAGE_LIMIT_DEFAULT = 50;
const MESSAGE_LIMIT_MAX = 500;

function trimSnippet(text: string | null | undefined, maxLen = SNIPPET_MAX): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}...` : collapsed;
}

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

interface ThreadRow {
  id: string;
  provider_id: string;
  provider_thread_id: string;
  title: string | null;
  project_name: string | null;
  repo_path: string | null;
  cwd: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

// Batch-lookup providerThreadId + providerId for a list of internal thread ids,
// so search/related results can be enriched with deep links in one query.
function lookupThreadKeys(
  db: Database,
  ids: string[],
): Map<string, { providerId: string; providerThreadId: string }> {
  const out = new Map<string, { providerId: string; providerThreadId: string }>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .query(
      `SELECT id, provider_id, provider_thread_id FROM threads WHERE id IN (${placeholders})`,
    )
    .all(...ids) as Array<{ id: string; provider_id: string; provider_thread_id: string }>;
  for (const r of rows) {
    out.set(r.id, { providerId: r.provider_id, providerThreadId: r.provider_thread_id });
  }
  return out;
}

export async function runMcpServer(db: Database, config: AppConfig): Promise<void> {
  const server = new McpServer({ name: "threaddy", version: "0.1.0" });

  // ---------- search_threads ----------
  server.tool(
    "search_threads",
    [
      "Search the Threaddy archive of past conversations across Codex, Cursor,",
      "and Claude Code. Returns metadata + a short snippet per match (NOT full",
      "message content). Use `get_thread` to fetch the timeline of a specific",
      "result. Each result includes an `openInApp` deep link when the source",
      "app supports it (Codex, Claude Code).",
    ].join(" "),
    {
      query: z.string().min(1).describe("Search query. Matches message content (FTS), titles, project names, and provider ids (fuzzy)."),
      mode: z
        .enum(["hybrid", "semantic", "keyword"])
        .optional()
        .describe("Search mode. 'hybrid' (default) merges semantic + keyword. 'keyword' is fastest. 'semantic' requires the embedding model."),
      provider: z.enum(["codex", "claude-code", "cursor"]).optional().describe("Restrict to one provider."),
      project: z.string().optional().describe("Restrict to one project (exact match on project name)."),
      pinned: z.boolean().optional().describe("Only include user-pinned threads."),
      limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional().describe(`Max results (default ${SEARCH_LIMIT_DEFAULT}, max ${SEARCH_LIMIT_MAX}).`),
    },
    async ({ query, mode = "hybrid", provider, project, pinned, limit = SEARCH_LIMIT_DEFAULT }) => {
      // Honour the global semanticSearch.enabled flag so a broken model never
      // crashes a tool call (matches the /api/search behaviour).
      const effectiveMode: SearchMode = config.semanticSearch.enabled ? mode : "keyword";

      // When pinned filter is on we'll drop non-pinned, so fetch a bigger pool.
      const fetchLimit = pinned ? Math.min(SEARCH_LIMIT_MAX * 2, limit * 4) : limit;
      const raw = await hybridSearch(
        db,
        query,
        effectiveMode,
        config.semanticSearch.model,
        fetchLimit,
        provider ?? null,
        project ?? null,
      );

      let filtered = raw;
      if (pinned) {
        const pinnedIds = new Set(
          (
            db
              .query(
                `SELECT t.id FROM threads t
                 JOIN thread_pins p ON p.provider_id = t.provider_id AND p.provider_thread_id = t.provider_thread_id`,
              )
              .all() as Array<{ id: string }>
          ).map((r) => r.id),
        );
        filtered = raw.filter((r) => pinnedIds.has(r.threadId));
      }
      filtered = filtered.slice(0, limit);

      const keys = lookupThreadKeys(db, filtered.map((r) => r.threadId));

      const results = filtered.map((r) => {
        const key = keys.get(r.threadId);
        return {
          threadId: r.threadId,
          title: r.threadTitle,
          provider: r.provider,
          project: r.projectName,
          score: Number(r.score.toFixed(3)),
          matchedBy: r.matchedBy,
          snippet: trimSnippet(r.contentPreview),
          openInApp: key ? providerDeepLinkUrl(key.providerId, key.providerThreadId) : null,
        };
      });

      return jsonResult({ count: results.length, mode: effectiveMode, results });
    },
  );

  // ---------- get_thread ----------
  server.tool(
    "get_thread",
    [
      "Fetch the message timeline for one thread by its threadId (the id",
      "returned by search_threads / list_pinned / find_related). Returns",
      "message previews by default; pass includeFullContent=true to get full",
      "message bodies (can be very large for long threads — prefer paging).",
    ].join(" "),
    {
      threadId: z.string().min(1).describe("Internal thread id (the `threadId` field from other Threaddy tools)."),
      messageLimit: z
        .number()
        .int()
        .min(1)
        .max(MESSAGE_LIMIT_MAX)
        .optional()
        .describe(`Max messages to return (default ${MESSAGE_LIMIT_DEFAULT}, max ${MESSAGE_LIMIT_MAX}).`),
      messageOffset: z.number().int().min(0).optional().describe("Skip this many messages from the start (chronological)."),
      includeFullContent: z
        .boolean()
        .optional()
        .describe("When true, include `content` for each message (full body); otherwise only `contentPreview`."),
    },
    async ({ threadId, messageLimit = MESSAGE_LIMIT_DEFAULT, messageOffset = 0, includeFullContent = false }) => {
      const thread = db
        .query(
          `SELECT id, provider_id, provider_thread_id, title, project_name, repo_path, cwd, status, created_at, updated_at
           FROM threads WHERE id = ?`,
        )
        .get(threadId) as ThreadRow | null;
      if (!thread) return jsonResult({ error: "thread not found", threadId });

      const totalRow = db
        .query("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
        .get(threadId) as { c: number };
      const totalMessages = Number(totalRow?.c ?? 0);

      const rows = db
        .query(
          `SELECT ordinal, role, kind, created_at AS createdAt, content_preview AS contentPreview,
                  content_text AS contentText, tool_name AS toolName, tool_call_id AS toolCallId
           FROM messages
           WHERE thread_id = ?
           ORDER BY ordinal ASC
           LIMIT ? OFFSET ?`,
        )
        .all(threadId, messageLimit, messageOffset) as Array<{
        ordinal: number;
        role: string;
        kind: string;
        createdAt: string | null;
        contentPreview: string | null;
        contentText: string | null;
        toolName: string | null;
        toolCallId: string | null;
      }>;

      const messages = rows.map((m) => ({
        ordinal: m.ordinal,
        role: m.role,
        kind: m.kind,
        createdAt: m.createdAt,
        toolName: m.toolName,
        toolCallId: m.toolCallId,
        // contentPreview is the cheap field that's always safe to return.
        // includeFullContent only adds the (potentially huge) full text.
        contentPreview: m.contentPreview,
        ...(includeFullContent ? { content: m.contentText ?? m.contentPreview } : {}),
      }));

      return jsonResult({
        threadId: thread.id,
        title: thread.title,
        provider: thread.provider_id,
        project: thread.project_name,
        repoPath: thread.repo_path,
        cwd: thread.cwd,
        status: thread.status,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
        totalMessages,
        messageOffset,
        messageLimit,
        returned: messages.length,
        openInApp: providerDeepLinkUrl(thread.provider_id, thread.provider_thread_id),
        messages,
      });
    },
  );

  // ---------- list_pinned ----------
  server.tool(
    "list_pinned",
    [
      "List user-pinned threads across providers. Pins are imported on each",
      "index pass from each app's own pin/star storage (Codex pinned-thread-ids,",
      "Cursor cursor/pinnedComposers, Claude desktop starredIds).",
    ].join(" "),
    {
      provider: z.enum(["codex", "claude-code", "cursor"]).optional().describe("Restrict to one provider."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(PINNED_LIMIT_MAX)
        .optional()
        .describe(`Max results (default ${PINNED_LIMIT_DEFAULT}, max ${PINNED_LIMIT_MAX}).`),
    },
    async ({ provider, limit = PINNED_LIMIT_DEFAULT }) => {
      const whereProvider = provider ? "AND t.provider_id = ?" : "";
      const params: Array<string | number> = [];
      if (provider) params.push(provider);
      params.push(limit);

      const rows = db
        .query(
          `SELECT t.id AS threadId, t.title, t.provider_id AS providerId,
                  t.provider_thread_id AS providerThreadId, t.project_name AS projectName,
                  t.updated_at AS updatedAt
           FROM thread_pins p
           JOIN threads t ON t.provider_id = p.provider_id
                          AND t.provider_thread_id = p.provider_thread_id
           WHERE t.status != 'orphaned' ${whereProvider}
           GROUP BY t.id
           ORDER BY MAX(p.pinned_at) DESC, t.updated_at DESC
           LIMIT ?`,
        )
        .all(...params) as Array<{
        threadId: string;
        title: string | null;
        providerId: string;
        providerThreadId: string;
        projectName: string | null;
        updatedAt: string | null;
      }>;

      return jsonResult({
        count: rows.length,
        threads: rows.map((r) => ({
          threadId: r.threadId,
          title: r.title,
          provider: r.providerId,
          project: r.projectName,
          updatedAt: r.updatedAt,
          openInApp: providerDeepLinkUrl(r.providerId, r.providerThreadId),
        })),
      });
    },
  );

  // ---------- find_related ----------
  server.tool(
    "find_related",
    [
      "Find threads semantically related to a given thread, based on stored",
      "chunk embeddings. Useful for surfacing past conversations on similar",
      "topics. Requires that the source thread has been semantically indexed.",
    ].join(" "),
    {
      threadId: z.string().min(1).describe("Internal thread id (from another Threaddy tool's result)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(RELATED_LIMIT_MAX)
        .optional()
        .describe(`Max related threads (default ${RELATED_LIMIT_DEFAULT}, max ${RELATED_LIMIT_MAX}).`),
    },
    async ({ threadId, limit = RELATED_LIMIT_DEFAULT }) => {
      const raw = await getRelatedThreads(db, threadId, config.semanticSearch.model, limit);
      if (raw.length === 0) {
        return jsonResult({ count: 0, threads: [], note: "No related threads (source thread may not have stored embeddings yet)." });
      }
      const keys = lookupThreadKeys(db, raw.map((r) => r.threadId));
      const threads = raw.map((r) => {
        const key = keys.get(r.threadId);
        return {
          threadId: r.threadId,
          title: r.threadTitle,
          provider: r.provider,
          project: r.projectName,
          score: Number(r.score.toFixed(3)),
          snippet: trimSnippet(r.contentPreview, 200),
          openInApp: key ? providerDeepLinkUrl(key.providerId, key.providerThreadId) : null,
        };
      });
      return jsonResult({ count: threads.length, threads });
    },
  );

  await server.connect(new StdioServerTransport());
}
