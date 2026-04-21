import type { Database } from "bun:sqlite";

import type {
  AppConfig,
  CandidateSource,
  DiscoveredRoot,
  ExistingSourceRecord,
  IndexRunSummary,
  NormalizedThreadBundle,
  ProviderId,
  ProviderScanResult,
} from "../../core/types/domain";
import { newId, stableId } from "../../core/utils/ids";
import { sha256File } from "../../core/utils/fs";
import { messageId } from "../../providers/shared";
import { providerRegistry } from "../../providers/registry";

function getExistingSource(db: Database, sourcePath: string): ExistingSourceRecord | null {
  const row = db
    .query("SELECT source_path, size, mtime_ms, content_hash FROM sources WHERE source_path = ?")
    .get(sourcePath) as Record<string, unknown> | null;

  if (!row) {
    return null;
  }

  return {
    sourcePath: String(row.source_path),
    size: Number(row.size),
    mtimeMs: Number(row.mtime_ms),
    contentHash: row.content_hash ? String(row.content_hash) : null,
  };
}

function writeRoots(db: Database, roots: DiscoveredRoot[]): void {
  const stmt = db.query(
    "INSERT OR REPLACE INTO source_roots (id, provider_id, path, status, last_scanned_at, notes, file_count_estimate) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  for (const root of roots) {
    stmt.run(stableId([root.providerId, root.path]), root.providerId, root.path, root.status, new Date().toISOString(), root.notes ?? null, 0);
  }
}

function writeSource(db: Database, candidate: CandidateSource, contentHash: string | null, status: string): void {
  db.query(
    "INSERT OR REPLACE INTO sources (source_path, provider_id, source_root_path, source_type, size, mtime_ms, content_hash, last_indexed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    candidate.path,
    candidate.providerId,
    candidate.sourceRootPath,
    candidate.type,
    candidate.size,
    Math.floor(candidate.mtimeMs),
    contentHash,
    new Date().toISOString(),
    status,
  );
}

function persistBundle(db: Database, bundle: NormalizedThreadBundle): { messagesUpserted: number } {
  const threadId = stableId([bundle.providerId, bundle.providerThreadId]);
  const now = new Date().toISOString();
  const userCount = bundle.messages.filter((message) => message.role === "user").length;
  const assistantCount = bundle.messages.filter((message) => message.role === "assistant").length;
  const toolCount = bundle.messages.filter((message) => message.kind === "tool_call").length;
  const errorCount = bundle.issues.filter((issue) => issue.severity === "error").length;

  db.query(
    `INSERT OR REPLACE INTO threads (
      id, provider_id, provider_thread_id, source_root_path, title, project_name, repo_path, cwd, created_at, updated_at,
      message_count, user_message_count, assistant_message_count, tool_call_count, error_count, status, is_archived,
      summary, first_user_snippet, last_assistant_snippet, tags_json, capabilities_json, thread_flags_json, metadata_json,
      parser_version, last_indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    threadId,
    bundle.providerId,
    bundle.providerThreadId,
    bundle.sourceRootPath,
    bundle.title,
    bundle.projectName,
    bundle.repoPath,
    bundle.cwd,
    bundle.createdAt,
    bundle.updatedAt,
    bundle.messages.length,
    userCount,
    assistantCount,
    toolCount,
    errorCount,
    bundle.status,
    bundle.isArchived ? 1 : 0,
    bundle.summary,
    bundle.firstUserSnippet,
    bundle.lastAssistantSnippet,
    JSON.stringify(bundle.tags),
    JSON.stringify(bundle.capabilities),
    JSON.stringify(bundle.flags),
    JSON.stringify(bundle.metadata),
    1,
    now,
  );

  db.query("DELETE FROM thread_sources WHERE thread_id = ?").run(threadId);
  db.query("INSERT INTO thread_sources (thread_id, source_path, source_role) VALUES (?, ?, ?)").run(threadId, bundle.sourcePath, "primary");

  db.query("DELETE FROM messages WHERE thread_id = ?").run(threadId);
  const messageInsert = db.query(
    "INSERT INTO messages (id, thread_id, ordinal, role, kind, created_at, content_text, content_preview, tool_name, tool_call_id, source_message_id, source_path, source_offset, parse_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (const message of bundle.messages) {
    messageInsert.run(
      messageId(threadId, message.ordinal, message.sourceMessageId),
      threadId,
      message.ordinal,
      message.role,
      message.kind,
      message.createdAt,
      message.contentText,
      message.contentPreview,
      message.toolName ?? null,
      message.toolCallId ?? null,
      message.sourceMessageId ?? null,
      message.sourcePath,
      message.sourceOffset ?? null,
      message.parseStatus,
    );
  }

  const nowIso = new Date().toISOString();
  const issueUpsert = db.query(
    `INSERT INTO parse_issues (id, provider_id, source_path, severity, code, message, first_seen_at, last_seen_at, count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       count = parse_issues.count + 1,
       message = excluded.message,
       severity = excluded.severity`,
  );

  for (const entry of bundle.issues) {
    issueUpsert.run(
      stableId([entry.providerId, entry.sourcePath, entry.code]),
      entry.providerId,
      entry.sourcePath,
      entry.severity,
      entry.code,
      entry.message,
      nowIso,
      nowIso,
    );
  }

  return { messagesUpserted: bundle.messages.length };
}

function createRunningIndexRun(db: Database, providers: ProviderId[]): IndexRunSummary {
  const summary: IndexRunSummary = {
    id: newId(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    providers,
    rootsScanned: 0,
    filesSeen: 0,
    filesChanged: 0,
    threadsUpserted: 0,
    messagesUpserted: 0,
    errors: 0,
    notes: null,
  };

  db.query(
    "INSERT INTO index_runs (id, started_at, completed_at, status, providers_json, roots_scanned, files_seen, files_changed, threads_upserted, messages_upserted, errors, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    summary.id,
    summary.startedAt,
    null,
    summary.status,
    JSON.stringify(summary.providers),
    0,
    0,
    0,
    0,
    0,
    0,
    null,
  );

  return summary;
}

function finalizeIndexRun(db: Database, summary: IndexRunSummary): void {
  db.query(
    "UPDATE index_runs SET completed_at = ?, status = ?, roots_scanned = ?, files_seen = ?, files_changed = ?, threads_upserted = ?, messages_upserted = ?, errors = ?, notes = ? WHERE id = ?",
  ).run(
    summary.completedAt,
    summary.status,
    summary.rootsScanned,
    summary.filesSeen,
    summary.filesChanged,
    summary.threadsUpserted,
    summary.messagesUpserted,
    summary.errors,
    summary.notes,
    summary.id,
  );
}

export async function scanProviders(config: AppConfig): Promise<ProviderScanResult[]> {
  const output: ProviderScanResult[] = [];

  for (const provider of providerRegistry) {
    const roots = await provider.discover(config);
    const candidates = (
      await Promise.all(
        roots.map(async (root) => {
          const listed = await provider.listCandidates(root);
          return listed;
        }),
      )
    ).flat();

    output.push({
      providerId: provider.id,
      roots,
      candidates,
    });
  }

  return output;
}

export async function runIndex(db: Database, config: AppConfig, onlyProviderId?: ProviderId): Promise<IndexRunSummary> {
  const providers = onlyProviderId ? providerRegistry.filter((provider) => provider.id === onlyProviderId) : providerRegistry;
  const summary = createRunningIndexRun(
    db,
    providers.map((provider) => provider.id),
  );

  try {
    for (const provider of providers) {
      const roots = await provider.discover(config);
      writeRoots(db, roots);
      summary.rootsScanned += roots.length;

      for (const root of roots) {
        const candidates = await provider.listCandidates(root);
        summary.filesSeen += candidates.length;

        for (const candidate of candidates) {
          const existing = getExistingSource(db, candidate.path);
          const shouldReparse = await provider.shouldReparse(candidate, existing);

          if (!shouldReparse) {
            continue;
          }

          summary.filesChanged += 1;
          const contentHash = candidate.type === "jsonl" ? await sha256File(candidate.path) : null;

          try {
            const bundles = await provider.parse(candidate);
            writeSource(db, candidate, contentHash, "ok");

            for (const bundle of bundles) {
              const persisted = persistBundle(db, bundle);
              summary.threadsUpserted += 1;
              summary.messagesUpserted += persisted.messagesUpserted;
              summary.errors += bundle.issues.filter((entry) => entry.severity === "error").length;
            }
          } catch (error) {
            summary.errors += 1;
            writeSource(db, candidate, contentHash, "error");
            db.query(
              `INSERT INTO parse_issues (id, provider_id, source_path, severity, code, message, first_seen_at, last_seen_at, count)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, count = parse_issues.count + 1, message = excluded.message`,
            ).run(
              stableId([provider.id, candidate.path, "provider_parse_failed"]),
              provider.id,
              candidate.path,
              "error",
              "provider_parse_failed",
              error instanceof Error ? error.message : String(error),
              summary.startedAt,
              new Date().toISOString(),
            );
          }
        }
      }
    }

    summary.completedAt = new Date().toISOString();
    summary.status = summary.errors > 0 ? "partial" : "ok";
    finalizeIndexRun(db, summary);
    return summary;
  } catch (error) {
    summary.completedAt = new Date().toISOString();
    summary.status = "failed";
    summary.notes = error instanceof Error ? error.message : String(error);
    finalizeIndexRun(db, summary);
    throw error;
  }
}

