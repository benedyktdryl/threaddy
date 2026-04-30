import type { Database } from "bun:sqlite";

export interface DashboardStats {
  threads: number;
  messages: number;
  issues: number;
  runs: number;
  lastRun: {
    startedAt: string | null;
    completedAt: string | null;
    status: string | null;
  } | null;
}

export interface ThreadListItem {
  id: string;
  title: string | null;
  titleSource: string | null;
  providerId: string;
  projectName: string | null;
  repoPath: string | null;
  updatedAt: string | null;
  status: string;
  messageCount: number;
  toolCallCount: number;
  summary: string | null;
  initialPromptPreview: string | null;
}

export type ThreadSortField = "updatedAt" | "messageCount" | "toolCallCount" | "title";
export type SortDir = "asc" | "desc";

export interface ThreadListQuery {
  provider?: string | null;
  project?: string | null;
  status?: string | null;
  q?: string | null;
  page: number;
  pageSize: number;
  sort?: ThreadSortField | null;
  dir?: SortDir | null;
  hideSubagents?: boolean | null;
}

export interface ThreadListResult {
  items: ThreadListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ThreadDetail {
  thread: {
    id: string;
    providerId: string;
    providerThreadId: string;
    title: string | null;
    projectName: string | null;
    repoPath: string | null;
    cwd: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolCallCount: number;
    errorCount: number;
    status: string;
    isArchived: boolean;
    summary: string | null;
    initialPrompt: string | null;
    initialPromptPreview: string | null;
    titleSource: string | null;
    initialPromptSource: string | null;
    firstUserSnippet: string | null;
    lastAssistantSnippet: string | null;
    tagsJson: string | null;
    capabilitiesJson: string | null;
    flagsJson: string | null;
    metadataJson: string | null;
  };
  sources: Array<{
    sourcePath: string;
    sourceRole: string;
  }>;
  messages: Array<{
    ordinal: number;
    role: string;
    kind: string;
    createdAt: string | null;
    contentPreview: string | null;
    contentText: string | null;
    toolName: string | null;
    toolCallId: string | null;
  }>;
  issues: Array<{
    severity: string;
    code: string;
    message: string;
    count: number;
    lastSeenAt: string;
  }>;
}

export interface SourceRootRow {
  providerId: string;
  path: string;
  status: string;
  lastScannedAt: string | null;
  notes: string | null;
}

export interface ParseIssueRow {
  providerId: string;
  sourcePath: string;
  severity: string;
  code: string;
  message: string;
  count: number;
  lastSeenAt: string;
}

export interface IndexRunRow {
  startedAt: string;
  completedAt: string | null;
  status: string;
  providersJson: string;
  filesChanged: number;
  threadsUpserted: number;
  messagesUpserted: number;
  errors: number;
}

export interface SavedFilterRow {
  id: string;
  name: string;
  href: string;
  createdAt: string;
}

export interface GroupSummaryRow {
  name: string;
  count: number;
  latestUpdatedAt: string | null;
  okCount: number;
  partialCount: number;
}

function count(db: Database, sql: string): number {
  return Number((db.query(sql).get() as Record<string, unknown>).count);
}

export function getDashboardStats(db: Database): DashboardStats {
  const lastRunRow = db.query("SELECT started_at, completed_at, status FROM index_runs ORDER BY started_at DESC LIMIT 1").get() as
    | Record<string, unknown>
    | null;

  return {
    threads: count(db, "SELECT COUNT(*) AS count FROM threads"),
    messages: count(db, "SELECT COUNT(*) AS count FROM messages"),
    issues: count(db, "SELECT COUNT(*) AS count FROM parse_issues"),
    runs: count(db, "SELECT COUNT(*) AS count FROM index_runs"),
    lastRun: lastRunRow
      ? {
          startedAt: String(lastRunRow.started_at ?? ""),
          completedAt: lastRunRow.completed_at ? String(lastRunRow.completed_at) : null,
          status: lastRunRow.status ? String(lastRunRow.status) : null,
        }
      : null,
  };
}

function buildThreadWhere(query: ThreadListQuery): { whereSql: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];

  if (query.provider) {
    conditions.push("provider_id = ?");
    params.push(query.provider);
  }

  if (query.project) {
    conditions.push("project_name = ?");
    params.push(query.project);
  }

  if (query.status) {
    conditions.push("status = ?");
    params.push(query.status);
  } else {
    conditions.push("status != 'orphaned'");
  }

  if (query.q) {
    conditions.push(
      "(COALESCE(title, '') LIKE ? OR COALESCE(initial_prompt, '') LIKE ? OR COALESCE(project_name, '') LIKE ? OR COALESCE(repo_path, '') LIKE ? OR COALESCE(summary, '') LIKE ?)",
    );
    const value = `%${query.q}%`;
    params.push(value, value, value, value, value);
  }

  if (query.hideSubagents) {
    // For claude-code and codex: hasSubagents:true means this thread IS a subagent (has a parent).
    // For cursor: hasSubagents:true means the thread SPAWNED subagents (it's the parent) — keep those.
    //   Cursor sub-agent threads are detected by checking if their provider_thread_id appears
    //   in any other cursor thread's metadata_json subagentComposerIds array.
    conditions.push(
      `NOT (
        (provider_id IN ('claude-code', 'codex') AND thread_flags_json LIKE '%"hasSubagents":true%')
        OR
        (provider_id = 'cursor' AND EXISTS (
          SELECT 1 FROM threads _parent
          WHERE _parent.provider_id = 'cursor'
            AND _parent.metadata_json LIKE '%"subagentComposerIds"%'
            AND _parent.metadata_json LIKE '%"' || threads.provider_thread_id || '"%'
            AND _parent.id != threads.id
        ))
      )`,
    );
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export function listThreads(db: Database, query: ThreadListQuery): ThreadListResult {
  const normalizedPage = Math.max(1, query.page);
  const normalizedPageSize = Math.min(250, Math.max(25, query.pageSize));
  const { whereSql, params } = buildThreadWhere(query);
  const totalRow = db
    .query(`SELECT COUNT(*) AS count FROM threads ${whereSql}`)
    .get(...params) as Record<string, unknown>;
  const total = Number(totalRow.count ?? 0);
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const sortColMap: Record<string, string> = {
    updatedAt: "updated_at",
    messageCount: "message_count",
    toolCallCount: "tool_call_count",
    title: "COALESCE(title, '')",
  };
  const sortCol = sortColMap[query.sort ?? ""] ?? "updated_at";
  const sortDir = query.dir === "asc" ? "ASC" : "DESC";

  const items = db.query(
    `SELECT id, title, title_source AS titleSource, provider_id AS providerId, project_name AS projectName, repo_path AS repoPath, updated_at AS updatedAt,
            status, message_count AS messageCount, tool_call_count AS toolCallCount, summary,
            initial_prompt_preview AS initialPromptPreview
     FROM threads
     ${whereSql}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`,
  ).all(...params, normalizedPageSize, offset) as ThreadListItem[];

  return {
    items,
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}

export function getThreadDetail(db: Database, threadId: string): ThreadDetail | null {
  const thread = db.query(
    `SELECT id,
            provider_id AS providerId, provider_thread_id AS providerThreadId,
            title, project_name AS projectName, repo_path AS repoPath, cwd,
            created_at AS createdAt, updated_at AS updatedAt,
            message_count AS messageCount, user_message_count AS userMessageCount,
            assistant_message_count AS assistantMessageCount, tool_call_count AS toolCallCount,
            error_count AS errorCount, status, is_archived AS isArchived,
            summary, initial_prompt AS initialPrompt, initial_prompt_preview AS initialPromptPreview,
            title_source AS titleSource, initial_prompt_source AS initialPromptSource,
            first_user_snippet AS firstUserSnippet, last_assistant_snippet AS lastAssistantSnippet,
            tags_json AS tagsJson, capabilities_json AS capabilitiesJson, thread_flags_json AS flagsJson,
            metadata_json AS metadataJson
     FROM threads
     WHERE id = ?`,
  ).get(threadId) as ThreadDetail["thread"] | null;

  if (!thread) {
    return null;
  }

  const sources = db.query("SELECT source_path AS sourcePath, source_role AS sourceRole FROM thread_sources WHERE thread_id = ? ORDER BY source_role, source_path").all(
    threadId,
  ) as ThreadDetail["sources"];
  const messages = db.query(
    `SELECT ordinal, role, kind, created_at AS createdAt, content_preview AS contentPreview,
            content_text AS contentText, tool_name AS toolName, tool_call_id AS toolCallId
     FROM messages
     WHERE thread_id = ?
     ORDER BY CASE WHEN created_at IS NULL THEN 1 ELSE 0 END, created_at DESC, ordinal DESC
     LIMIT 500`,
  ).all(threadId) as ThreadDetail["messages"];
  const issues = db.query(
    `SELECT severity, code, message, count, last_seen_at AS lastSeenAt
     FROM parse_issues
     WHERE source_path IN (SELECT source_path FROM thread_sources WHERE thread_id = ?)
     ORDER BY severity DESC, last_seen_at DESC`,
  ).all(threadId) as ThreadDetail["issues"];

  return { thread, sources, messages, issues };
}

export function listProjects(db: Database, limit = 20): Array<{ projectName: string; count: number }> {
  return db.query(
    `SELECT project_name AS projectName, COUNT(*) AS count
     FROM threads
     WHERE project_name IS NOT NULL AND project_name != ''
     GROUP BY project_name
     ORDER BY count DESC, project_name ASC
     LIMIT ?`,
  ).all(limit) as Array<{ projectName: string; count: number }>;
}

export function listProviders(db: Database): Array<{ providerId: string; count: number }> {
  return db.query(
    `SELECT provider_id AS providerId, COUNT(*) AS count
     FROM threads
     GROUP BY provider_id
     ORDER BY count DESC, provider_id ASC`,
  ).all() as Array<{ providerId: string; count: number }>;
}

export function listSavedFilters(db: Database, limit = 10): SavedFilterRow[] {
  return db.query(
    `SELECT id, name, href, created_at AS createdAt
     FROM saved_filters
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(limit) as SavedFilterRow[];
}

export function getProviderSummary(db: Database, providerId: string): GroupSummaryRow | null {
  return db.query(
    `SELECT provider_id AS name,
            COUNT(*) AS count,
            MAX(updated_at) AS latestUpdatedAt,
            SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS okCount,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partialCount
     FROM threads
     WHERE provider_id = ?
     GROUP BY provider_id`,
  ).get(providerId) as GroupSummaryRow | null;
}

export function getProjectSummary(db: Database, projectName: string): GroupSummaryRow | null {
  return db.query(
    `SELECT project_name AS name,
            COUNT(*) AS count,
            MAX(updated_at) AS latestUpdatedAt,
            SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS okCount,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partialCount
     FROM threads
     WHERE project_name = ?
     GROUP BY project_name`,
  ).get(projectName) as GroupSummaryRow | null;
}

export function listSourceRoots(db: Database): SourceRootRow[] {
  return db.query(
    `SELECT provider_id AS providerId, path, status, last_scanned_at AS lastScannedAt, notes
     FROM source_roots
     ORDER BY provider_id ASC, path ASC`,
  ).all() as SourceRootRow[];
}

export function listParseIssues(db: Database): ParseIssueRow[] {
  return db.query(
    `SELECT provider_id AS providerId, source_path AS sourcePath, severity, code, message, count, last_seen_at AS lastSeenAt
     FROM parse_issues
     ORDER BY last_seen_at DESC, severity DESC`,
  ).all() as ParseIssueRow[];
}

export function listIndexRuns(db: Database, limit = 50): IndexRunRow[] {
  return db.query(
    `SELECT started_at AS startedAt, completed_at AS completedAt, status, providers_json AS providersJson,
            files_changed AS filesChanged, threads_upserted AS threadsUpserted, messages_upserted AS messagesUpserted, errors
     FROM index_runs
     ORDER BY started_at DESC
     LIMIT ?`,
  ).all(limit) as IndexRunRow[];
}
