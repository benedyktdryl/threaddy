import type { Database } from "bun:sqlite";
import { embedText } from "../embeddings/embedder";
import { searchResultBodyPreview } from "../format-search-display";
import type { SearchResult } from "../types/index";

// Max embeddings to load per query — bounds memory to ~60MB at 384 dims
const MAX_CANDIDATES = 40_000;

function dotProduct(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

interface EmbeddingRow {
  chunk_id: string;
  embedding: Uint8Array;
  content: string;
  thread_id: string;
  title: string | null;
  provider_id: string;
  project_name: string | null;
  message_id: string | null;
  initial_prompt_preview: string | null;
  first_user_snippet: string | null;
}

function buildFilteredQuery(provider?: string | null, project?: string | null): { sql: string; params: string[] } {
  const conditions = ["t.status != 'orphaned'"];
  const params: string[] = [];
  if (provider) { conditions.push("t.provider_id = ?"); params.push(provider); }
  if (project) { conditions.push("t.project_name = ?"); params.push(project); }
  return {
    sql: conditions.join(" AND "),
    params,
  };
}

export async function semanticSearch(
  db: Database,
  query: string,
  model: string,
  limit: number,
  provider?: string | null,
  project?: string | null,
): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query, model);
  const { sql: filterSql, params } = buildFilteredQuery(provider, project);

  const rows = db.query(`
    SELECT
      mc.id AS chunk_id,
      mce.embedding,
      mc.content,
      mc.thread_id,
      mc.message_id,
      t.title,
      t.provider_id,
      t.project_name,
      t.initial_prompt_preview AS initial_prompt_preview,
      t.first_user_snippet AS first_user_snippet
    FROM message_chunk_embeddings mce
    JOIN message_chunks mc ON mc.id = mce.chunk_id
    JOIN threads t ON t.id = mc.thread_id
    WHERE ${filterSql}
    LIMIT ${MAX_CANDIDATES}
  `).all(...params) as EmbeddingRow[];

  type Scored = EmbeddingRow & { score: number };
  const scored: Scored[] = [];

  for (const row of rows) {
    const emb = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    const score = dotProduct(queryEmbedding, emb);
    if (score > 0.25) scored.push({ ...row, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((row) => ({
    chunkId: row.chunk_id,
    score: Math.min(1, Math.max(0, row.score)),
    provider: row.provider_id,
    threadId: row.thread_id,
    threadTitle: row.title,
    messageId: row.message_id,
    projectName: row.project_name,
    initialPromptPreview: row.initial_prompt_preview,
    firstUserSnippet: row.first_user_snippet,
    contentPreview: searchResultBodyPreview(row.initial_prompt_preview, row.first_user_snippet),
    matchedBy: "semantic" as const,
  }));
}

export async function getRelatedThreads(
  db: Database,
  threadId: string,
  model: string,
  limit = 5,
): Promise<SearchResult[]> {
  const ref = db.query(`
    SELECT mce.embedding
    FROM message_chunk_embeddings mce
    JOIN message_chunks mc ON mc.id = mce.chunk_id
    WHERE mc.thread_id = ?
    LIMIT 1
  `).get(threadId) as { embedding: Uint8Array } | null;

  if (!ref) return [];

  const queryEmbedding = new Float32Array(ref.embedding.buffer, ref.embedding.byteOffset, ref.embedding.byteLength / 4);

  const rows = db.query(`
    SELECT
      mc.id AS chunk_id,
      mce.embedding,
      mc.content,
      mc.thread_id,
      mc.message_id,
      t.title,
      t.provider_id,
      t.project_name,
      t.initial_prompt_preview AS initial_prompt_preview,
      t.first_user_snippet AS first_user_snippet
    FROM message_chunk_embeddings mce
    JOIN message_chunks mc ON mc.id = mce.chunk_id
    JOIN threads t ON t.id = mc.thread_id
    WHERE t.status != 'orphaned' AND mc.thread_id != ?
    LIMIT ${MAX_CANDIDATES}
  `).all(threadId) as EmbeddingRow[];

  // Deduplicate by thread_id, keeping best score per thread
  const byThread = new Map<string, { row: EmbeddingRow; score: number }>();

  for (const row of rows) {
    const emb = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    const score = dotProduct(queryEmbedding, emb);
    if (score <= 0.3) continue;
    const existing = byThread.get(row.thread_id);
    if (!existing || score > existing.score) {
      byThread.set(row.thread_id, { row, score });
    }
  }

  return Array.from(byThread.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      chunkId: row.chunk_id,
      score: Math.min(1, Math.max(0, score)),
      provider: row.provider_id,
      threadId: row.thread_id,
      threadTitle: row.title,
      messageId: row.message_id,
      projectName: row.project_name,
      initialPromptPreview: row.initial_prompt_preview,
      firstUserSnippet: row.first_user_snippet,
      contentPreview: searchResultBodyPreview(row.initial_prompt_preview, row.first_user_snippet),
      matchedBy: "semantic" as const,
    }));
}
