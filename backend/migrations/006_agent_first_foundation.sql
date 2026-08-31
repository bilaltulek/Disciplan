-- Additive foundation for the generic agent runtime.
-- This intentionally coexists with plan_generation_runs/agent_run_jobs until cutover.

CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  summary TEXT,
  summary_updated_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_user_activity
  ON agent_threads (user_id, last_activity_at DESC)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_message_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  content_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (thread_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_thread_created
  ON agent_messages (thread_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY,
  thread_id UUID REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  input_message_id UUID REFERENCES agent_messages(id) ON DELETE SET NULL,
  retry_of_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  trigger_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_number INTEGER NOT NULL DEFAULT 0 CHECK (attempt_number >= 0),
  run_type TEXT NOT NULL CHECK (run_type IN ('initial_plan', 'conversation', 'repair', 'health_scan')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('assignment_form', 'user_message', 'user_request', 'schedule_health')),
  status TEXT NOT NULL CHECK (status IN (
    'accepted', 'queued', 'running', 'waiting_for_input',
    'waiting_for_approval', 'succeeded', 'failed', 'cancelled'
  )),
  current_step TEXT,
  graph_version TEXT NOT NULL,
  prompt_bundle_version TEXT NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  provider_run_id TEXT,
  plan_source TEXT CHECK (plan_source IN ('gemini', 'fallback_error', 'fallback_limit', 'agentic')),
  failure_code TEXT,
  failure_message TEXT,
  cancellation_requested_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created
  ON agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_assignment_created
  ON agent_runs (assignment_id, created_at DESC)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_nonterminal
  ON agent_runs (status, created_at ASC)
  WHERE status IN ('accepted', 'queued', 'running', 'waiting_for_input', 'waiting_for_approval');
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_one_retry_per_run
  ON agent_runs (retry_of_run_id)
  WHERE retry_of_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step TEXT,
  detail_code TEXT,
  safe_detail TEXT,
  resource_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_created
  ON agent_run_events (run_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_retention
  ON agent_run_events (created_at ASC);

CREATE TABLE IF NOT EXISTS agent_run_resumes (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'cancelled')),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, idempotency_key),
  UNIQUE (message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_resumes_one_pending
  ON agent_run_resumes (run_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS agent_dispatch_outbox (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  dispatch_key TEXT NOT NULL DEFAULT 'initial',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatching', 'dispatched', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  dispatch_started_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_run_id TEXT,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, task_type, dispatch_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_dispatch_outbox_pending
  ON agent_dispatch_outbox (next_attempt_at ASC, created_at ASC)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS plan_versions (
  id UUID PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  parent_plan_version_id UUID REFERENCES plan_versions(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_approval', 'published', 'rejected', 'superseded', 'invalid')),
  proposal_hash TEXT NOT NULL,
  rationale TEXT,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, version_number),
  UNIQUE (assignment_id, proposal_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_versions_one_published
  ON plan_versions (assignment_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS plan_version_items (
  id UUID PRIMARY KEY,
  plan_version_id UUID NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  logical_task_id UUID NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  task_description TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  operation TEXT NOT NULL DEFAULT 'retain' CHECK (operation IN ('add', 'move', 'edit', 'retain', 'archive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plan_version_id, logical_task_id),
  UNIQUE (plan_version_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_plan_version_items_assignment_date
  ON plan_version_items (assignment_id, scheduled_date ASC);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  plan_version_id UUID NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  proposal_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_approvals_one_pending_run
  ON agent_approvals (run_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_pending
  ON agent_approvals (user_id, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS user_planning_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  weekday_available_minutes JSONB NOT NULL DEFAULT '{"0":0,"1":60,"2":60,"3":60,"4":60,"5":60,"6":0}'::jsonb,
  max_daily_minutes INTEGER NOT NULL DEFAULT 120 CHECK (max_daily_minutes BETWEEN 1 AND 1440),
  preferred_session_minutes INTEGER NOT NULL DEFAULT 45 CHECK (preferred_session_minutes BETWEEN 5 AND 480),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preference_memories (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preference_memories_confirmed_key
  ON user_preference_memories (user_id, memory_key)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_user_preference_memories_user_status
  ON user_preference_memories (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, key_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expiry ON api_rate_limits (expires_at ASC);

CREATE TABLE IF NOT EXISTS ai_usage_monthly_aggregates (
  month_start DATE NOT NULL,
  model TEXT NOT NULL,
  request_count BIGINT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  prompt_tokens BIGINT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (total_micro_usd >= 0),
  PRIMARY KEY (month_start, model)
);

ALTER TABLE study_tasks
  ADD COLUMN IF NOT EXISTS logical_task_id UUID,
  ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES plan_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes BETWEEN 1 AND 1440);

UPDATE study_tasks
SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
WHERE completed = TRUE AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_study_tasks_plan_version
  ON study_tasks (plan_version_id)
  WHERE plan_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_study_tasks_logical_task
  ON study_tasks (logical_task_id)
  WHERE logical_task_id IS NOT NULL;

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_agent_run
  ON ai_usage_events (agent_run_id, created_at ASC)
  WHERE agent_run_id IS NOT NULL;

ALTER TABLE ai_budget_reservations
  ALTER COLUMN run_id DROP NOT NULL;

ALTER TABLE ai_budget_reservations
  ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_budget_reservations_agent_run_active
  ON ai_budget_reservations (agent_run_id)
  WHERE agent_run_id IS NOT NULL AND status = 'active';
