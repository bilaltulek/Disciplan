CREATE TABLE IF NOT EXISTS plan_generation_runs (
  id UUID PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'reviewing', 'revising', 'succeeded', 'failed', 'cancelled')),
  current_step TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  workflow_run_id TEXT,
  plan_source TEXT CHECK (plan_source IN ('gemini', 'fallback_error', 'fallback_limit', 'agentic')),
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_generation_runs_assignment_created
  ON plan_generation_runs (assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_generation_runs_user_status
  ON plan_generation_runs (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS plan_generation_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES plan_generation_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step TEXT,
  detail TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_generation_run_events_run_created
  ON plan_generation_run_events (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_run_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'plan_generation',
  payload JSONB NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_pending
  ON agent_run_jobs (created_at ASC);

CREATE TABLE IF NOT EXISTS ai_budget_reservations (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES plan_generation_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reserved_total_micro_usd BIGINT NOT NULL CHECK (reserved_total_micro_usd >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'released', 'finalized')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_budget_reservations_run_active
  ON ai_budget_reservations (run_id) WHERE status = 'active';

ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS generation_run_id UUID REFERENCES plan_generation_runs(id) ON DELETE SET NULL;
ALTER TABLE study_tasks ADD COLUMN IF NOT EXISTS generation_ordinal INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_tasks_run_ordinal
  ON study_tasks (generation_run_id, generation_ordinal)
  WHERE generation_run_id IS NOT NULL;
