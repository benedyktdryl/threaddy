-- Add BLOB-based embedding table (replaces vec0 approach which required sqlite-vec extension)
-- Works with Bun's built-in SQLite (no extension loading needed)
CREATE TABLE IF NOT EXISTS message_chunk_embeddings (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  embedded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mce_chunk_id ON message_chunk_embeddings(chunk_id);

-- chunk_embedding_refs was used by the old vec0 approach; safe to drop
DROP TABLE IF EXISTS chunk_embedding_refs;
