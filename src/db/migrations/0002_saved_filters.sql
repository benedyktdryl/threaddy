CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  href TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_filters_href ON saved_filters(href);
