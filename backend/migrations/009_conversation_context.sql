-- Durable, user-owned conversational context for restart-safe assistant turns.
ALTER TABLE agent_threads
  ADD COLUMN IF NOT EXISTS context_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_version INTEGER NOT NULL DEFAULT 1 CHECK (context_version > 0),
  ADD COLUMN IF NOT EXISTS summary_through_message_id UUID REFERENCES agent_messages(id) ON DELETE SET NULL;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS resume_count INTEGER NOT NULL DEFAULT 0 CHECK (resume_count >= 0);
