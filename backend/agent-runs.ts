const crypto = require('crypto');
const db = require('./db');
const config = require('./config.env');
const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('./agents/runtime-registry');
const planner = require('./gemini-planner');
const { validatePlan } = require('./plan-validator');

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

const mapRun = (row: any) => row && ({
  ...row,
  attempt_count: Number(row.attempt_count ?? row.attempt_number ?? 0),
  runtime_kind: row.runtime_kind || 'legacy',
});

const requestHash = (assignment: any) => crypto.createHash('sha256').update(JSON.stringify({
  complexity: assignment.complexity,
  description: assignment.description || '',
  dueDate: assignment.dueDate,
  title: assignment.title,
  totalItems: assignment.totalItems,
})).digest('hex');

const findIdempotentAssignmentRun = async ({ userId, idempotencyKey, assignment, error }: any) => {
  if (error?.code !== '23505') throw error;
  const existing = await db.query(
    `SELECT r.*, 'agent_first'::text AS runtime_kind, row_to_json(a) AS assignment FROM agent_runs r
     JOIN assignments a ON a.id = r.assignment_id
     WHERE r.user_id = $1 AND r.idempotency_key = $2`,
    [userId, idempotencyKey],
  );
  if (existing.rowCount === 0) throw error;
  const row = existing.rows[0];
  if (row.request_hash !== requestHash(assignment)) {
    const conflict = new Error('The idempotency key was already used with a different request.');
    conflict.code = 'IDEMPOTENCY_CONFLICT';
    throw conflict;
  }
  return { assignment: row.assignment, run: mapRun(row), duplicate: true };
};

const createAssignmentWithDeterministicPlan = async ({ userId, assignment, idempotencyKey, effectiveMode = 'off' }: any) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const assignmentResult = await client.query(
      `INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, assignment.title, assignment.complexity, assignment.dueDate, assignment.totalItems, assignment.description],
    );
    const savedAssignment = assignmentResult.rows[0];
    const profileResult = await client.query(
      `SELECT timezone, weekday_available_minutes, max_daily_minutes, preferred_session_minutes
       FROM user_planning_profiles WHERE user_id = $1`,
      [userId],
    );
    const loadResult = await client.query(
      `SELECT t.scheduled_date, COALESCE(SUM(t.estimated_minutes), 0)::int AS minutes
       FROM study_tasks t JOIN assignments a ON a.id = t.assignment_id
       WHERE a.user_id = $1 AND a.id <> $2 AND t.completed = FALSE AND t.archived_at IS NULL
       GROUP BY t.scheduled_date`,
      [userId, savedAssignment.id],
    );
    const profile = profileResult.rows[0] || null;
    const existingLoad = Object.fromEntries(loadResult.rows.map((row: any) => [row.scheduled_date, Number(row.minutes)]));
    const tasks = planner.buildFallbackPlan({
      ...assignment, planningProfile: profile, existingLoad,
    });
    const issues = validatePlan({ tasks, assignment, profile, existingLoad });
    if (issues.length) {
      const invalid = new Error('The assignment cannot be scheduled within the current planning capacity.');
      invalid.code = 'PLAN_VALIDATION_FAILED';
      invalid.issues = issues;
      throw invalid;
    }
    const runId = crypto.randomUUID();
    const runResult = await client.query(
      `INSERT INTO agent_runs (
         id,assignment_id,user_id,idempotency_key,request_hash,trigger_context,run_type,trigger_type,
         status,current_step,graph_version,prompt_bundle_version,plan_source,started_at,finished_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'initial_plan','assignment_form','succeeded','completed',$7,$8,'fallback_limit',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING *, 'agent_first'::text AS runtime_kind`,
      [runId, savedAssignment.id, userId, idempotencyKey, requestHash(assignment), JSON.stringify({ rolloutMode: effectiveMode }), GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
    );
    const normalizedTasks = tasks.map((task: any) => ({
      ...task, logicalTaskId: crypto.randomUUID(),
    }));
    const proposalHash = crypto.createHash('sha256').update(JSON.stringify(normalizedTasks.map((task: any) => ({
      task_description: task.task_description,
      scheduled_date: task.scheduled_date,
      estimated_minutes: task.estimated_minutes,
    })))).digest('hex');
    const planVersionId = crypto.randomUUID();
    await client.query(
      `INSERT INTO plan_versions (
         id,assignment_id,user_id,source_run_id,version_number,status,proposal_hash,rationale,assumptions,published_at
       ) VALUES ($1,$2,$3,$4,1,'published',$5,'Deterministic capacity-aware rollout fallback.','[]'::jsonb,CURRENT_TIMESTAMP)`,
      [planVersionId, savedAssignment.id, userId, runId, proposalHash],
    );
    for (const [ordinal, task] of normalizedTasks.entries()) {
      await client.query(
        `INSERT INTO plan_version_items (
           id,plan_version_id,assignment_id,logical_task_id,ordinal,task_description,scheduled_date,estimated_minutes,operation
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'add')`,
        [crypto.randomUUID(), planVersionId, savedAssignment.id, task.logicalTaskId, ordinal,
          task.task_description, task.scheduled_date, task.estimated_minutes],
      );
      await client.query(
        `INSERT INTO study_tasks (
           assignment_id,task_description,scheduled_date,completed,estimated_minutes,logical_task_id,plan_version_id
         ) VALUES ($1,$2,$3,FALSE,$4,$5,$6)`,
        [savedAssignment.id, task.task_description, task.scheduled_date, task.estimated_minutes, task.logicalTaskId, planVersionId],
      );
    }
    await client.query(
      `INSERT INTO agent_run_events (run_id,event_type,step,detail_code,safe_detail)
       VALUES ($1,'succeeded','completed','FALLBACK_PLAN_PUBLISHED','A deterministic validated plan was published.')`,
      [runId],
    );
    if (effectiveMode === 'shadow') {
      const shadowRunId = crypto.randomUUID();
      await client.query(
        `INSERT INTO agent_runs (
           id,assignment_id,user_id,idempotency_key,request_hash,trigger_context,run_type,trigger_type,
           status,current_step,graph_version,prompt_bundle_version
         ) VALUES ($1,$2,$3,$4,$5,'{"shadow":true}'::jsonb,'initial_plan','user_request','accepted','accepted',$6,$7)`,
        [shadowRunId, savedAssignment.id, userId, `shadow:${runId}`, requestHash(assignment), GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
      );
      await client.query(
        `INSERT INTO agent_dispatch_outbox (id,run_id,task_type) VALUES ($1,$2,'agent_run')`,
        [crypto.randomUUID(), shadowRunId],
      );
    }
    await client.query('COMMIT');
    return { assignment: savedAssignment, run: mapRun(runResult.rows[0]), duplicate: false };
  } catch (error: any) {
    await client.query('ROLLBACK');
    return findIdempotentAssignmentRun({ userId, idempotencyKey, assignment, error });
  } finally {
    client.release();
  }
};

const createAssignmentAndRun = async ({ userId, assignment, idempotencyKey }: any) => {
  const effectiveMode = config.agentExecutionPolicy.effectiveModeForUser(userId);
  if (effectiveMode !== 'active') {
    return createAssignmentWithDeterministicPlan({ userId, assignment, idempotencyKey, effectiveMode });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const assignmentResult = await client.query(
      `INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, assignment.title, assignment.complexity, assignment.dueDate, assignment.totalItems, assignment.description],
    );
    const runId = crypto.randomUUID();
    const hash = requestHash(assignment);
    const runResult = await client.query(
      `INSERT INTO agent_runs (
         id, assignment_id, user_id, idempotency_key, request_hash, run_type, trigger_type,
         status, current_step, graph_version, prompt_bundle_version
       ) VALUES ($1, $2, $3, $4, $5, 'initial_plan', 'assignment_form', 'accepted', 'accepted', $6, $7)
       RETURNING *, 'agent_first'::text AS runtime_kind`,
      [runId, assignmentResult.rows[0].id, userId, idempotencyKey, hash, GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
    );
    await client.query(
      `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
       VALUES ($1, 'accepted', 'accepted', 'ASSIGNMENT_ACCEPTED', 'Assignment accepted for planning.')`,
      [runId],
    );
    const outboxId = crypto.randomUUID();
    await client.query(
      `INSERT INTO agent_dispatch_outbox (id, run_id, task_type)
       VALUES ($1, $2, 'agent_run')`,
      [outboxId, runId],
    );
    await client.query('COMMIT');
    return { assignment: assignmentResult.rows[0], run: mapRun(runResult.rows[0]), duplicate: false };
  } catch (error: any) {
    await client.query('ROLLBACK');
    return findIdempotentAssignmentRun({ userId, idempotencyKey, assignment, error });
  } finally {
    client.release();
  }
};

const getRunForUser = async (runId: any, userId: any) => {
  const generic = await db.query(
    `SELECT *, 'agent_first'::text AS runtime_kind FROM agent_runs WHERE id = $1 AND user_id = $2`,
    [runId, userId],
  );
  if (generic.rows[0]) return mapRun(generic.rows[0]);
  const legacy = await db.query('SELECT * FROM plan_generation_runs WHERE id = $1 AND user_id = $2', [runId, userId]);
  return mapRun(legacy.rows[0]);
};

const getRunEventsForUser = async ({ runId, userId, afterId = 0, limit = 100 }: any) => {
  const owned = await db.query('SELECT 1 FROM agent_runs WHERE id = $1 AND user_id = $2', [runId, userId]);
  if (!owned.rowCount) return null;
  const result = await db.query(
    `SELECT id, event_type, step, detail_code, safe_detail, resource_refs, duration_ms, created_at
     FROM agent_run_events WHERE run_id = $1 AND id > $2
     ORDER BY id ASC LIMIT $3`,
    [runId, afterId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows;
};

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

const cancelRunForUser = async (runId: any, userId: any) => {
  const genericResult = await db.query(
    `UPDATE agent_runs SET status = 'cancelled', current_step = 'cancelled',
       cancellation_requested_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
       AND status IN ('accepted', 'queued', 'running', 'waiting_for_input', 'waiting_for_approval')
     RETURNING *, 'agent_first'::text AS runtime_kind`,
    [runId, userId],
  );
  const genericRun = mapRun(genericResult.rows[0]);
  if (genericRun) {
    await Promise.all([
      db.query("UPDATE agent_dispatch_outbox SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE run_id = $1 AND status <> 'dispatched'", [runId]),
      db.query("UPDATE ai_budget_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP WHERE agent_run_id = $1 AND status = 'active'", [runId]),
      db.query("INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail) VALUES ($1, 'cancelled', 'cancelled', 'USER_CANCELLED', 'The student cancelled this run.')", [runId]),
    ]);
    return genericRun;
  }
  const result = await db.query(
    `UPDATE plan_generation_runs SET status = 'cancelled', current_step = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND status NOT IN ('succeeded', 'failed', 'cancelled') RETURNING *`,
    [runId, userId],
  );
  const run = mapRun(result.rows[0]);
  if (run) {
    await db.query(
      `UPDATE ai_budget_reservations
       SET status = 'released', released_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP
       WHERE run_id = $1 AND status = 'active'`,
      [runId],
    );
  }
  return run;
};

const retryRunForUser = async (runId: any, userId: any) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const original = await client.query(
      `SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2 AND status IN ('failed', 'cancelled') FOR UPDATE`,
      [runId, userId],
    );
    if (original.rows[0]) {
      const source = original.rows[0];
      const newRunId = crypto.randomUUID();
      const retried = await client.query(
        `INSERT INTO agent_runs (
           id, thread_id, user_id, assignment_id, retry_of_run_id, idempotency_key, request_hash,
           run_type, trigger_type, status, current_step, graph_version, prompt_bundle_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user_request', 'accepted', 'accepted', $9, $10)
         ON CONFLICT (retry_of_run_id) WHERE retry_of_run_id IS NOT NULL DO NOTHING
         RETURNING *, 'agent_first'::text AS runtime_kind`,
        [newRunId, source.thread_id, userId, source.assignment_id, runId, `retry:${runId}`, source.request_hash,
          source.run_type, source.graph_version, source.prompt_bundle_version],
      );
      let run = retried.rows[0];
      if (!run) {
        const existingRetry = await client.query(
          `SELECT *, 'agent_first'::text AS runtime_kind FROM agent_runs WHERE retry_of_run_id = $1`,
          [runId],
        );
        run = existingRetry.rows[0];
      } else {
        await client.query(
          `INSERT INTO agent_dispatch_outbox (id, run_id, task_type) VALUES ($1, $2, 'agent_run')`,
          [crypto.randomUUID(), newRunId],
        );
      }
      await client.query('COMMIT');
      return mapRun(run);
    }
    await client.query('ROLLBACK');
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const result = await db.query(
    `UPDATE plan_generation_runs SET status = 'queued', current_step = 'queued', failure_code = NULL,
       failure_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND status IN ('failed', 'cancelled') RETURNING *`,
    [runId, userId],
  );
  return mapRun(result.rows[0]);
};

const enqueueExistingRun = async (run: any) => {
  if (run.runtime_kind === 'agent_first') {
    await db.query(
      `INSERT INTO agent_dispatch_outbox (id, run_id, task_type)
       VALUES ($1, $2, 'agent_run') ON CONFLICT (run_id, task_type, dispatch_key) DO NOTHING`,
      [crypto.randomUUID(), run.id],
    );
    return;
  }
  const outboxId = crypto.randomUUID();
  await db.query(
    `INSERT INTO agent_run_jobs (id, job_type, payload, checkpoint_cleanup_after)
     VALUES ($1, 'plan_generation', $2::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [outboxId, JSON.stringify({ runId: run.id, assignmentId: run.assignment_id, userId: run.user_id })],
  );
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

module.exports = {
  TERMINAL_STATUSES,
  createAssignmentAndRun,
  getRunForUser,
  getRunEventsForUser,
  setRunState,
  claimRun,
  getPlanningContext,
  publishTasks,
  cancelRunForUser,
  retryRunForUser,
  enqueueExistingRun,
  claimPendingAgentJobs,
  completeAgentJob,
  failAgentJob,
  listExpiredCheckpointCleanup,
  markCheckpointCleaned,
};
