const crypto = require('crypto');
const db = require('./db');

const mapRun = (row: any) => row && ({
  ...row,
  attempt_count: Number(row.attempt_count ?? row.attempt_number ?? 0),
  runtime_kind: row.runtime_kind || 'legacy',
});

const setRunState = async ({ runId, status, step, detail, failureCode = null, failureMessage = null, planSource = null }: any) => {
  const result = await db.query(
    `UPDATE plan_generation_runs
     SET status = $2, current_step = $3, failure_code = $4, failure_message = $5,
         plan_source = COALESCE($6, plan_source), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status <> 'cancelled'
     RETURNING *`,
    [runId, status, step, failureCode, failureMessage, planSource],
  );
  if (result.rowCount && detail) {
    await db.query(
      `INSERT INTO plan_generation_run_events (run_id, event_type, step, detail)
       VALUES ($1, $2, $3, $4)`,
      [runId, status, step, detail],
    );
  }
  return mapRun(result.rows[0]);
};

const claimRun = async (runId: any) => {
  const result = await db.query(
    `UPDATE plan_generation_runs
     SET status = 'running', current_step = 'intake', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'queued'
     RETURNING *`,
    [runId],
  );
  return mapRun(result.rows[0]);
};

const getPlanningContext = async (runId: any) => {
  const result = await db.query(
    `SELECT r.*, a.title, a.description, a.complexity, a.due_date, a.total_items
     FROM plan_generation_runs r JOIN assignments a ON a.id = r.assignment_id
     WHERE r.id = $1`,
    [runId],
  );
  return result.rows[0] || null;
};

const publishTasks = async ({ runId, tasks, source }: any) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT assignment_id FROM plan_generation_runs WHERE id = $1 AND status <> 'cancelled' FOR UPDATE`,
      [runId],
    );
    if (!active.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    for (const [ordinal, task] of tasks.entries()) {
      await client.query(
        `INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, estimated_minutes, generation_run_id, generation_ordinal)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (generation_run_id, generation_ordinal) WHERE generation_run_id IS NOT NULL DO NOTHING`,
        [active.rows[0].assignment_id, task.task_description, task.scheduled_date, task.estimated_minutes, runId, ordinal],
      );
    }
    await client.query(
      `UPDATE plan_generation_runs
       SET status = 'succeeded', current_step = 'published', plan_source = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [runId, source],
    );
    await client.query(
      `INSERT INTO plan_generation_run_events (run_id, event_type, step, detail)
       VALUES ($1, 'succeeded', 'published', 'Validated study plan published.')`,
      [runId],
    );
    await client.query('COMMIT');
    return true;
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const claimPendingAgentJobs = async ({ workerId, limit = 1 }: any = {}) => {
  const leaseToken = crypto.randomUUID();
  const result = await db.query(
    `WITH candidates AS (
      SELECT id
      FROM agent_run_jobs
      WHERE completed_at IS NULL
        AND next_attempt_at <= CURRENT_TIMESTAMP
        AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE agent_run_jobs job
    SET lease_token = $2,
        worker_id = $3,
        lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
        attempt_count = attempt_count + 1
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*`,
    [limit, leaseToken, workerId || null],
  );
  return { leaseToken, rows: result.rows };
};

const completeAgentJob = async (id: any, leaseToken: any) => db.query(
  `UPDATE agent_run_jobs
   SET completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_token = NULL,
       worker_id = NULL, last_error = NULL,
       checkpoint_cleanup_after = CURRENT_TIMESTAMP + INTERVAL '7 days'
   WHERE id = $1 AND lease_token = $2`,
  [id, leaseToken],
);

const failAgentJob = async (id: any, leaseToken: any, error: any, permanent: any = false) => db.query(
  `UPDATE agent_run_jobs
   SET completed_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE completed_at END,
       checkpoint_cleanup_after = CASE WHEN $4 THEN CURRENT_TIMESTAMP + INTERVAL '7 days' ELSE checkpoint_cleanup_after END,
       lease_expires_at = NULL, lease_token = NULL, worker_id = NULL,
       next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '30 seconds',
       last_error = $3
   WHERE id = $1 AND lease_token = $2`,
  [id, leaseToken, String(error.message || error).slice(0, 500), permanent],
);

const listExpiredCheckpointCleanup = async (limit: any = 25) => {
  const result = await db.query(
    `SELECT id, payload
     FROM agent_run_jobs
     WHERE completed_at IS NOT NULL
       AND checkpoint_cleaned_at IS NULL
       AND checkpoint_cleanup_after <= CURRENT_TIMESTAMP
     ORDER BY checkpoint_cleanup_after ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
};

const markCheckpointCleaned = async (id: any) => db.query(
  `UPDATE agent_run_jobs SET checkpoint_cleaned_at = CURRENT_TIMESTAMP
   WHERE id = $1 AND checkpoint_cleaned_at IS NULL`,
  [id],
);

export = {
  setRunState,
  claimRun,
  getPlanningContext,
  publishTasks,
  claimPendingAgentJobs,
  completeAgentJob,
  failAgentJob,
  listExpiredCheckpointCleanup,
  markCheckpointCleaned,
};
