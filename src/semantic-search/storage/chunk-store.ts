import type { Database } from "bun:sqlite";
import { stableId } from "../../core/utils/ids";
import type { ChunkRecord } from "../types/index";

export function chunkId(threadId: string, messageId: string | null, index: number): string {
  return stableId([threadId, messageId ?? "null", String(index)]);
}

export function contentHash(content: string): string {
  return Bun.hash(content).toString(16);
}

export function getEmbeddedChunkIds(db: Database, threadId: string): Set<string> {
  const rows = db
    .query(`SELECT mce.chunk_id FROM message_chunk_embeddings mce
            JOIN message_chunks mc ON mc.id = mce.chunk_id
            WHERE mc.thread_id = ?`)
    .all(threadId) as Array<{ chunk_id: string }>;
  return new Set(rows.map((r) => r.chunk_id));
}

export function getChunkHashMap(db: Database, threadId: string): Map<string, string> {
  const rows = db
    .query("SELECT id, content_hash FROM message_chunks WHERE thread_id = ?")
    .all(threadId) as Array<{ id: string; content_hash: string }>;
  return new Map(rows.map((r) => [r.id, r.content_hash]));
}

export function upsertChunk(db: Database, chunk: ChunkRecord): void {
  db.query(
    `INSERT OR REPLACE INTO message_chunks
       (id, thread_id, message_id, chunk_index, content, content_hash, char_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    chunk.id,
    chunk.threadId,
    chunk.messageId,
    chunk.chunkIndex,
    chunk.content,
    chunk.contentHash,
    chunk.charCount,
    chunk.createdAt,
  );
}

export function insertEmbedding(db: Database, chunkId: string, embedding: Float32Array): void {
  // Store as raw BLOB (Float32Array buffer)
  const blob = Buffer.from(embedding.buffer);
  db.query(
    `INSERT OR REPLACE INTO message_chunk_embeddings (chunk_id, embedding, embedded_at)
     VALUES (?, ?, ?)`,
  ).run(chunkId, blob, new Date().toISOString());
}

export function deleteChunksForThread(db: Database, threadId: string): void {
  db.query(`DELETE FROM message_chunk_embeddings WHERE chunk_id IN
            (SELECT id FROM message_chunks WHERE thread_id = ?)`).run(threadId);
  db.query("DELETE FROM message_chunks WHERE thread_id = ?").run(threadId);
}

export function getSemanticDiagnostics(db: Database) {
  const chunkCount = Number(
    (db.query("SELECT COUNT(*) AS count FROM message_chunks").get() as Record<string, unknown>).count,
  );
  const embeddingCount = Number(
    (db.query("SELECT COUNT(*) AS count FROM message_chunk_embeddings").get() as Record<string, unknown>).count,
  );
  return { chunkCount, embeddingCount };
}
