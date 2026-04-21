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
  providerId: string;
  projectName: string | null;
  repoPath: string | null;
  updatedAt: string | null;
  status: string;
  messageCount: number;
  toolCallCount: number;
  summary: string | null;
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

export function listThreads(db: Database, limit = 100): ThreadListItem[] {
  return db.query(
    `SELECT id, title, provider_id, project_name, repo_path, updated_at, status, message_count, tool_call_count, summary
     FROM threads
     ORDER BY updated_at DESC
     LIMIT ?`,
  ).all(limit) as ThreadListItem[];
}

export function getThreadDetail(db: Database, threadId: string): ThreadDetail | null {
  const thread = db.query(
    `SELECT id, provider_id, provider_thread_id, title, project_name, repo_path, cwd, created_at, updated_at,
            message_count, user_message_count, assistant_message_count, tool_call_count, error_count, status, is_archived,
            summary, first_user_snippet, last_assistant_snippet, tags_json, capabilities_json, thread_flags_json AS flags_json,
            metadata_json
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
     ORDER BY ordinal
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

