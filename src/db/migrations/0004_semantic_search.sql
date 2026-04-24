-- message_chunks: stores text chunks derived from messages for semantic search
CREATE TABLE IF NOT EXISTS message_chunks (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_chunks_thread ON message_chunks(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_chunks_message ON message_chunks(message_id);
CREATE INDEX IF NOT EXISTS idx_message_chunks_hash ON message_chunks(content_hash);

-- FTS5 virtual table for keyword search over chunks
CREATE VIRTUAL TABLE IF NOT EXISTS message_chunks_fts USING fts5(
  content,
  content='message_chunks',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS message_chunks_ai AFTER INSERT ON message_chunks BEGIN
  INSERT INTO message_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS message_chunks_ad AFTER DELETE ON message_chunks BEGIN
  INSERT INTO message_chunks_fts(message_chunks_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS message_chunks_au AFTER UPDATE OF content ON message_chunks BEGIN
  INSERT INTO message_chunks_fts(message_chunks_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
  INSERT INTO message_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- BLOB-based vector storage — works with Bun's SQLite via registered cosine_sim() function
-- Embeddings are stored as raw Float32Array blobs (384 floats, L2-normalized)
CREATE TABLE IF NOT EXISTS message_chunk_embeddings (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  embedded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mce_chunk_id ON message_chunk_embeddings(chunk_id);
