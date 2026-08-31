-- Convert the legacy outbox into a provider-neutral, Postgres-leased agent-job queue.
-- This migration preserves existing nonterminal runs so they can be claimed by the new worker.
DO $$
BEGIN
  IF to_regclass('public.workflow_outbox') IS NOT NULL THEN
    INSERT INTO agent_run_jobs (id, job_type, payload, attempt_count, last_error, created_at)
    SELECT id, 'plan_generation', payload, dispatch_attempts, last_error, created_at
    FROM workflow_outbox
    ON CONFLICT (id) DO NOTHING;
    DROP TABLE workflow_outbox;
  END IF;
END $$;

ALTER TABLE agent_run_jobs
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS checkpoint_cleanup_after TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS checkpoint_cleaned_at TIMESTAMP;

-- Requeue every nonterminal run during the controlled cutover.
UPDATE agent_run_jobs job
SET completed_at = NULL,
    lease_token = NULL,
    lease_started_at = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    next_attempt_at = CURRENT_TIMESTAMP
FROM plan_generation_runs run
WHERE job.payload->>'runId' = run.id::text
  AND run.status NOT IN ('succeeded', 'failed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_claimable
  ON agent_run_jobs (next_attempt_at ASC, created_at ASC)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_run_jobs_checkpoint_cleanup
  ON agent_run_jobs (checkpoint_cleanup_after ASC)
  WHERE completed_at IS NOT NULL AND checkpoint_cleaned_at IS NULL;
