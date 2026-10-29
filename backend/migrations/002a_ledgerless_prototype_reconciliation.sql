-- Reconcile the ledgerless workflow-outbox prototype that existed between the
-- committed 002 schema and the final 003-005 job schema. This migration sorts
-- before 003 so the normal runner can adopt the already-present objects
-- without rewriting their historical migration files.
DO $$
BEGIN
  IF to_regclass('public.workflow_outbox') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.plan_generation_runs') IS NULL THEN
    RAISE EXCEPTION 'workflow_outbox exists without plan_generation_runs; manual provenance review required';
  END IF;

  IF to_regclass('public.agent_run_jobs') IS NOT NULL THEN
    RAISE EXCEPTION 'workflow_outbox and agent_run_jobs both exist; manual reconciliation required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workflow_outbox outbox
    WHERE outbox.event_name <> 'disciplan/plan.requested'
       OR NOT (outbox.payload ? 'runId')
       OR NOT EXISTS (
         SELECT 1
         FROM plan_generation_runs run
         WHERE run.id::text = outbox.payload->>'runId'
       )
  ) THEN
    RAISE EXCEPTION 'workflow_outbox contains an unknown event or unlinked run; manual reconciliation required';
  END IF;

  CREATE TABLE agent_run_jobs (
    id UUID PRIMARY KEY,
    job_type TEXT NOT NULL DEFAULT 'plan_generation',
    payload JSONB NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_started_at TIMESTAMP,
    lease_token UUID,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    worker_id TEXT,
    lease_expires_at TIMESTAMP,
    completed_at TIMESTAMP,
    checkpoint_cleanup_after TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    checkpoint_cleaned_at TIMESTAMP
  );

  INSERT INTO agent_run_jobs (
    id,
    job_type,
    payload,
    attempt_count,
    last_error,
    created_at,
    next_attempt_at,
    completed_at,
    checkpoint_cleanup_after
  )
  SELECT
    outbox.id,
    'plan_generation',
    outbox.payload,
    outbox.dispatch_attempts,
    outbox.last_error,
    outbox.created_at,
    CASE
      WHEN run.status IN ('succeeded', 'failed', 'cancelled') THEN outbox.next_attempt_at
      ELSE CURRENT_TIMESTAMP
    END,
    CASE
      WHEN run.status IN ('succeeded', 'failed', 'cancelled')
        THEN COALESCE(outbox.dispatched_at, outbox.created_at)
      ELSE NULL
    END,
    COALESCE(outbox.dispatched_at, outbox.created_at) + INTERVAL '7 days'
  FROM workflow_outbox outbox
  JOIN plan_generation_runs run
    ON run.id::text = outbox.payload->>'runId';

  CREATE INDEX idx_agent_run_jobs_pending
    ON agent_run_jobs (created_at ASC);
  CREATE INDEX idx_agent_run_jobs_dispatchable
    ON agent_run_jobs (next_attempt_at ASC, created_at ASC);
  CREATE INDEX idx_agent_run_jobs_claimable
    ON agent_run_jobs (next_attempt_at ASC, created_at ASC)
    WHERE completed_at IS NULL;
  CREATE INDEX idx_agent_run_jobs_checkpoint_cleanup
    ON agent_run_jobs (checkpoint_cleanup_after ASC)
    WHERE completed_at IS NOT NULL AND checkpoint_cleaned_at IS NULL;

  DROP TABLE workflow_outbox;
END $$;
