-- Pinned threads. Keyed by (provider_id, provider_thread_id) so pins survive
-- re-indexing (threads are upserted, not deleted) and can be recorded even for
-- a thread that hasn't been parsed yet.
--   source = 'codex' | 'claude-code' | 'cursor'  → imported from the provider's
--             own pin/star storage on each index run (refreshed wholesale).
--   source = 'manual'                            → set by the user inside Threaddy;
--             never touched by provider sync.
CREATE TABLE IF NOT EXISTS thread_pins (
  provider_id        TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  source             TEXT NOT NULL,
  pinned_at          TEXT NOT NULL,
  PRIMARY KEY (provider_id, provider_thread_id, source)
);

CREATE INDEX IF NOT EXISTS idx_thread_pins_lookup
  ON thread_pins(provider_id, provider_thread_id);
