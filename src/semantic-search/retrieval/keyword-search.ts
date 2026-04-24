import type { Database } from "bun:sqlite";
import { searchResultBodyPreview } from "../format-search-display";
import type { SearchResult } from "../types/index";

interface FtsRow {
  chunk_id: string;
  rank: number;
  content: string;
  thread_id: string;
  title: string | null;
  provider_id: string;
  project_name: string | null;
  message_id: string | null;
  initial_prompt_preview: string | null;
  first_user_snippet: string | null;
}

function escapeFtsQuery(query: string): string {
  // Wrap each word in double quotes for exact phrase matching fallback
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(" ");
  return words || '""';
}

export function keywordSearch(
  db: Database,
  query: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): SearchResult[] {
  const ftsQuery = escapeFtsQuery(query);
  const providerFilter = provider ? "AND t.provider_id = ?" : "";
  const projectFilter = project ? "AND t.project_name = ?" : "";
  const params: (string | number)[] = [ftsQuery, limit * 2];
  if (provider) params.push(provider);
  if (project) params.push(project);
  params.push(limit);

  let rows: FtsRow[];

  try {
    rows = db.query(`
      WITH fts_results AS (
        SELECT rowid, rank
        FROM message_chunks_fts
        WHERE content MATCH ?
        ORDER BY rank
        LIMIT ?
      )
      SELECT
        mc.id AS chunk_id,
        fr.rank,
        mc.content,
        mc.thread_id,
        mc.message_id,
        t.title,
        t.provider_id,
        t.project_name,
        t.initial_prompt_preview AS initial_prompt_preview,
        t.first_user_snippet AS first_user_snippet
      FROM fts_results fr
      JOIN message_chunks mc ON mc.rowid = fr.rowid
      JOIN threads t ON t.id = mc.thread_id
      WHERE t.status != 'orphaned'
      ${providerFilter}
      ${projectFilter}
      ORDER BY fr.rank
      LIMIT ?
    `).all(...params) as FtsRow[];
  } catch {
    return [];
  }

  // FTS5 rank is negative (higher magnitude = better match)
  const minRank = rows.reduce((min, r) => Math.min(min, r.rank), -1);

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    // Normalize rank to 0-1
    score: minRank < 0 ? Math.min(1, row.rank / minRank) : 0,
    provider: row.provider_id,
    threadId: row.thread_id,
    threadTitle: row.title,
    messageId: row.message_id,
    projectName: row.project_name,
    initialPromptPreview: row.initial_prompt_preview,
    firstUserSnippet: row.first_user_snippet,
    contentPreview: searchResultBodyPreview(row.initial_prompt_preview, row.first_user_snippet),
    matchedBy: "keyword" as const,
  }));
}
