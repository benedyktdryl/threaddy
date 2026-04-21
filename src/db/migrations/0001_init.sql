CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS source_roots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL,
  last_scanned_at TEXT,
  notes TEXT,
  file_count_estimate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sources (
  source_path TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  source_root_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  content_hash TEXT,
  last_indexed_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  source_root_path TEXT NOT NULL,
  title TEXT,
  project_name TEXT,
  repo_path TEXT,
  cwd TEXT,
  created_at TEXT,
  updated_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  user_message_count INTEGER NOT NULL DEFAULT 0,
  assistant_message_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  first_user_snippet TEXT,
  last_assistant_snippet TEXT,
  tags_json TEXT,
  capabilities_json TEXT,
  thread_flags_json TEXT,
  metadata_json TEXT,
  parser_version INTEGER NOT NULL DEFAULT 1,
  last_indexed_at TEXT NOT NULL,
  UNIQUE(provider_id, provider_thread_id)
);

CREATE TABLE IF NOT EXISTS thread_sources (
  thread_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_role TEXT NOT NULL,
  PRIMARY KEY (thread_id, source_path)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  role TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT,
  content_text TEXT,
  content_preview TEXT,
  tool_name TEXT,
  tool_call_id TEXT,
  source_message_id TEXT,
  source_path TEXT NOT NULL,
  source_offset INTEGER,
  parse_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS index_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  providers_json TEXT NOT NULL,
  roots_scanned INTEGER NOT NULL,
  files_seen INTEGER NOT NULL,
  files_changed INTEGER NOT NULL,
  threads_upserted INTEGER NOT NULL,
  messages_upserted INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS parse_issues (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_provider_updated ON threads(provider_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_name);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_messages_thread_ordinal ON messages(thread_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_parse_issues_provider ON parse_issues(provider_id, severity);

