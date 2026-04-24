import type { Database } from "bun:sqlite";
import type { AppConfig } from "../../core/types/domain";
import { chunkText, shouldEmbedMessage } from "../chunking/chunker";
import { embedTexts } from "../embeddings/embedder";
import {
  chunkId,
  contentHash,
  deleteChunksForThread,
  getChunkHashMap,
  getEmbeddedChunkIds,
  insertEmbedding,
  upsertChunk,
} from "../storage/chunk-store";
import type { ChunkRecord } from "../types/index";

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  kind: string;
  content_text: string | null;
}

interface ThreadRow {
  id: string;
  provider_id: string;
  project_name: string | null;
}

export interface SemanticIndexStats {
  threadsProcessed: number;
  chunksCreated: number;
  embeddingsCreated: number;
  errors: number;
}

export async function runSemanticIndex(
  db: Database,
  config: AppConfig,
  onlyThreadId?: string,
): Promise<SemanticIndexStats> {
  const stats: SemanticIndexStats = {
    threadsProcessed: 0,
    chunksCreated: 0,
    embeddingsCreated: 0,
    errors: 0,
  };

  if (!config.semanticSearch.enabled) return stats;

  const threadQuery = onlyThreadId
    ? "SELECT id, provider_id, project_name FROM threads WHERE id = ? AND status != 'orphaned'"
    : "SELECT id, provider_id, project_name FROM threads WHERE status != 'orphaned'";

  const threads = (
    onlyThreadId
      ? db.query(threadQuery).all(onlyThreadId)
      : db.query(threadQuery).all()
  ) as ThreadRow[];

  const { chunkSize, chunkOverlap, model } = config.semanticSearch;

  // Collect all chunks that need embedding across all threads
  const pendingEmbeds: Array<{ chunkId: string; content: string }> = [];

  for (const thread of threads) {
    try {
      const messages = db
        .query(
          `SELECT id, thread_id, role, kind, content_text
           FROM messages
           WHERE thread_id = ? AND content_text IS NOT NULL
           ORDER BY ordinal ASC`,
        )
        .all(thread.id) as MessageRow[];

      const existingHashes = getChunkHashMap(db, thread.id);
      const embeddedIds = getEmbeddedChunkIds(db, thread.id);
      const seenChunkIds = new Set<string>();
      let newChunks = 0;

      const now = new Date().toISOString();

      for (const msg of messages) {
        if (!shouldEmbedMessage(msg.role, msg.kind, msg.content_text)) continue;

        const chunks = chunkText(msg.content_text!, chunkSize, chunkOverlap);

        for (const chunk of chunks) {
          const id = chunkId(thread.id, msg.id, chunk.index);
          const hash = contentHash(chunk.content);
          seenChunkIds.add(id);

          const existingHash = existingHashes.get(id);
          const needsChunkUpdate = existingHash !== hash;

          if (needsChunkUpdate) {
            const record: ChunkRecord = {
              id,
              threadId: thread.id,
              messageId: msg.id,
              chunkIndex: chunk.index,
              content: chunk.content,
              contentHash: hash,
              charCount: chunk.content.length,
              createdAt: now,
            };
            upsertChunk(db, record);
            newChunks++;

            if (!embeddedIds.has(id)) {
              pendingEmbeds.push({ chunkId: id, content: chunk.content });
            }
          } else if (!embeddedIds.has(id)) {
            pendingEmbeds.push({ chunkId: id, content: chunk.content });
          }
        }
      }

      // Remove chunks that no longer exist in the thread
      for (const [existingId] of existingHashes) {
        if (!seenChunkIds.has(existingId)) {
          deleteChunksForThread(db, thread.id);
          break; // deleteChunksForThread removes all; re-index will recreate
        }
      }

      stats.chunksCreated += newChunks;
      stats.threadsProcessed++;
    } catch {
      stats.errors++;
    }
  }

  // Batch embed all pending chunks
  if (pendingEmbeds.length > 0) {
    const EMBED_BATCH = 32;
    for (let i = 0; i < pendingEmbeds.length; i += EMBED_BATCH) {
      const batch = pendingEmbeds.slice(i, i + EMBED_BATCH);
      try {
        const embeddings = await embedTexts(
          batch.map((c) => c.content),
          model,
        );
        for (let j = 0; j < batch.length; j++) {
          insertEmbedding(db, batch[j].chunkId, embeddings[j]);
          stats.embeddingsCreated++;
        }
      } catch {
        stats.errors++;
      }
    }
  }

  return stats;
}
