ALTER TABLE threads ADD COLUMN title_source TEXT;
ALTER TABLE threads ADD COLUMN initial_prompt TEXT;
ALTER TABLE threads ADD COLUMN initial_prompt_preview TEXT;
ALTER TABLE threads ADD COLUMN initial_prompt_source TEXT;

CREATE INDEX IF NOT EXISTS idx_threads_updated_desc ON threads(updated_at DESC);
