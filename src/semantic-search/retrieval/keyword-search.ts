import type { Database } from "bun:sqlite";
import Fuse from "fuse.js";
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

interface MetadataRow {
  thread_id: string;
  title: string | null;
  provider_id: string;
  project_name: string | null;
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

// FTS only indexes message bodies, so project names, titles, and providers
// never match there. We fuzzy-search thread metadata so users can find threads
// by project ("kuba cooks" → "kuba-cooks"), provider, or title fragment.
function fuzzyMetadataSearch(
  db: Database,
  query: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const providerFilter = provider ? "AND t.provider_id = ?" : "";
  const projectFilter = project ? "AND t.project_name = ?" : "";
  const params: string[] = [];
  if (provider) params.push(provider);
  if (project) params.push(project);

  const rows = db.query(`
    SELECT
      t.id          AS thread_id,
      t.title,
      t.provider_id,
      t.project_name,
      t.initial_prompt_preview,
      t.first_user_snippet
    FROM threads t
    WHERE t.status != 'orphaned'
      ${providerFilter}
      ${projectFilter}
  `).all(...params) as MetadataRow[];

  // Fuse.js fuzzy search across project name, title, and provider.
  // threshold 0.35 tolerates minor differences (missing hyphens, typos, etc.)
  // while keeping precision reasonable.
  const fuse = new Fuse(rows, {
    keys: [
      { name: "project_name", weight: 2 },  // project names rank highest
      { name: "title",        weight: 1.5 },
      { name: "provider_id",  weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  });

  const matches = fuse.search(trimmed, { limit });

  return matches.map(({ item, score }) => ({
    chunkId: `meta:${item.thread_id}`,
    // Fuse score is 0 (perfect) → 1 (no match); invert to match our convention
    score: 1 - (score ?? 0),
    provider: item.provider_id,
    threadId: item.thread_id,
    threadTitle: item.title,
    messageId: null,
    projectName: item.project_name,
    initialPromptPreview: item.initial_prompt_preview,
    firstUserSnippet: item.first_user_snippet,
    contentPreview: searchResultBodyPreview(item.initial_prompt_preview, item.first_user_snippet),
    matchedBy: "keyword" as const,
  }));
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
    rows = [];
  }

  // FTS5 rank is negative (higher magnitude = better match)
  const minRank = rows.reduce((min, r) => Math.min(min, r.rank), -1);

  const contentResults: SearchResult[] = rows.map((row) => ({
    chunkId: row.chunk_id,
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

  // Append fuzzy metadata matches (project/title/provider) not already in
  // content results. FTS content matches take precedence since they carry the
  // actual matched text.
  const seenThreads = new Set(contentResults.map((r) => r.threadId));
  const metadataResults = fuzzyMetadataSearch(db, query, limit, provider, project).filter(
    (r) => !seenThreads.has(r.threadId),
  );

  return [...contentResults, ...metadataResults].slice(0, limit);
}
