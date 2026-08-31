-- Backward-compatible durability additions for the bounded agent-job queue.

ALTER TABLE agent_run_jobs
  ADD COLUMN IF NOT EXISTS lease_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_dispatchable
  ON agent_run_jobs (next_attempt_at ASC, created_at ASC);

ALTER TABLE ai_budget_reservations
  ADD COLUMN IF NOT EXISTS used_total_micro_usd BIGINT NOT NULL DEFAULT 0
    CHECK (used_total_micro_usd >= 0),
  ADD COLUMN IF NOT EXISTS reserved_request_count INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_request_count >= 0),
  ADD COLUMN IF NOT EXISTS used_request_count INTEGER NOT NULL DEFAULT 0
    CHECK (used_request_count >= 0),
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS generation_run_id UUID REFERENCES plan_generation_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_run
  ON ai_usage_events (generation_run_id, created_at ASC)
  WHERE generation_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_budget_reservations_active
  ON ai_budget_reservations (status, user_id, created_at)
  WHERE status = 'active';
