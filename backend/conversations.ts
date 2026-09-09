const crypto = require('crypto');
const db = require('./db');
const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('./agents/runtime-registry');

const hashMessageRequest = ({ content, assignmentId, replyToRunId }: any) => crypto.createHash('sha256')
  .update(JSON.stringify({ assignmentId: assignmentId || null, replyToRunId: replyToRunId || null, content }))
  .digest('hex');

const createThreadForUser = async ({ userId, title = null }: any) => {
  const result = await db.query(
    `INSERT INTO agent_threads (id, user_id, title) VALUES ($1, $2, $3) RETURNING *`,
    [crypto.randomUUID(), userId, title],
  );
  return result.rows[0];
};

const listThreadsForUser = async ({ userId, before, limit = 30 }: any) => {
  const result = await db.query(
    `SELECT id, title, status, summary, last_activity_at, created_at, updated_at
     FROM agent_threads
     WHERE user_id = $1 AND status <> 'deleted'
       AND ($2::timestamptz IS NULL OR last_activity_at < $2)
     ORDER BY last_activity_at DESC LIMIT $3`,
    [userId, before || null, Math.min(Math.max(limit, 1), 50)],
  );
  return result.rows;
};

const getThreadForUser = async ({ userId, threadId, before, limit = 50 }: any) => {
  const thread = await db.query(
    `SELECT id, title, status, summary, last_activity_at, created_at, updated_at
     FROM agent_threads WHERE id = $1 AND user_id = $2 AND status <> 'deleted'`,
    [threadId, userId],
  );
  if (!thread.rows[0]) return null;
  const messages = await db.query(
    `SELECT id, role, content, content_metadata, created_at
     FROM agent_messages WHERE thread_id = $1
       AND ($2::timestamptz IS NULL OR created_at < $2)
     ORDER BY created_at DESC, id DESC LIMIT $3`,
    [threadId, before || null, Math.min(Math.max(limit, 1), 100)],
  );
  return { thread: thread.rows[0], messages: messages.rows.reverse() };
};

const createMessageRun = async ({ userId, threadId, content, assignmentId, replyToRunId, clientMessageId, idempotencyKey }: any) => {
  const client = await db.connect();
  const requestHash = hashMessageRequest({ content, assignmentId, replyToRunId });
  try {
    await client.query('BEGIN');
    const thread = await client.query(
      `SELECT id FROM agent_threads WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE`,
      [threadId, userId],
    );
    if (!thread.rows[0]) {
      const missing = new Error('Conversation not found.');
      missing.code = 'RESOURCE_NOT_FOUND';
      throw missing;
    }
    if (assignmentId) {
      const assignment = await client.query('SELECT id FROM assignments WHERE id = $1 AND user_id = $2', [assignmentId, userId]);
      if (!assignment.rows[0]) {
        const missing = new Error('Assignment not found.');
        missing.code = 'RESOURCE_NOT_FOUND';
        throw missing;
      }
    }
    const messageId = crypto.randomUUID();
    const message = await client.query(
      `INSERT INTO agent_messages (id, thread_id, user_id, client_message_id, role, content)
       VALUES ($1, $2, $3, $4, 'user', $5) RETURNING *`,
      [messageId, threadId, userId, clientMessageId, content],
    );
    const waiting = await client.query(
      `SELECT * FROM agent_runs
       WHERE thread_id = $1 AND user_id = $2 AND status = 'waiting_for_input'
         AND ($3::uuid IS NULL OR id = $3)
       ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [threadId, userId, replyToRunId || null],
    );
    if (waiting.rows[0]) {
      const resumeId = crypto.randomUUID();
      const resumed = await client.query(
        `INSERT INTO agent_run_resumes (id, run_id, user_id, message_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [resumeId, waiting.rows[0].id, userId, messageId, idempotencyKey, requestHash],
      );
      const run = await client.query(
        `UPDATE agent_runs SET status = 'accepted', current_step = 'resuming', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'waiting_for_input'
         RETURNING *, 'agent_first'::text AS runtime_kind`,
        [waiting.rows[0].id, userId],
      );
      if (!run.rows[0]) throw new Error('The clarification run could not be resumed.');
      await client.query(
        `INSERT INTO agent_dispatch_outbox (id, run_id, task_type, dispatch_key)
         VALUES ($1, $2, 'agent_run', $3)`,
        [crypto.randomUUID(), run.rows[0].id, `resume:${resumeId}`],
      );
      await client.query(
        `UPDATE agent_threads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [threadId],
      );
      await client.query('COMMIT');
      return { message: message.rows[0], run: run.rows[0], resume: resumed.rows[0], duplicate: false };
    }
    if (replyToRunId) {
      const stale = new Error('The clarification is no longer waiting for a response.');
      stale.code = 'STALE_CLARIFICATION';
      throw stale;
    }
    const runId = crypto.randomUUID();
    const run = await client.query(
      `INSERT INTO agent_runs (
         id, thread_id, user_id, assignment_id, input_message_id, idempotency_key, request_hash,
         run_type, trigger_type, status, current_step, graph_version, prompt_bundle_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'conversation', 'user_message', 'accepted', 'accepted', $8, $9)
       RETURNING *, 'agent_first'::text AS runtime_kind`,
      [runId, threadId, userId, assignmentId || null, messageId, idempotencyKey, requestHash, GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
    );
    await client.query(
      `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
       VALUES ($1, 'accepted', 'accepted', 'MESSAGE_ACCEPTED', 'Message accepted for agent processing.')`,
      [runId],
    );
    await client.query(
      `INSERT INTO agent_dispatch_outbox (id, run_id, task_type) VALUES ($1, $2, 'agent_run')`,
      [crypto.randomUUID(), runId],
    );
    await client.query(
      `UPDATE agent_threads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
       title = COALESCE(title, LEFT($2, 80)) WHERE id = $1`,
      [threadId, content],
    );
    await client.query('COMMIT');
    return { message: message.rows[0], run: run.rows[0], duplicate: false };
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code !== '23505') throw error;
    const existingResume = await db.query(
      `SELECT r.*, rr.request_hash, row_to_json(m) AS message
       FROM agent_run_resumes rr
       JOIN agent_runs r ON r.id = rr.run_id
       JOIN agent_messages m ON m.id = rr.message_id
       WHERE rr.user_id = $1 AND rr.idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    if (existingResume.rows[0]) {
      if (existingResume.rows[0].request_hash !== requestHash) {
        const conflict = new Error('The idempotency key was already used with a different message.');
        conflict.code = 'IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      const { message, ...run } = existingResume.rows[0];
      return { message, run, duplicate: true };
    }
    const existing = await db.query(
      `SELECT r.*, row_to_json(m) AS message
       FROM agent_runs r JOIN agent_messages m ON m.id = r.input_message_id
       WHERE r.user_id = $1 AND r.idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    if (!existing.rows[0] || existing.rows[0].request_hash !== requestHash) {
      const conflict = new Error('The idempotency key was already used with a different message.');
      conflict.code = 'IDEMPOTENCY_CONFLICT';
      throw conflict;
    }
    const { message, ...run } = existing.rows[0];
    return { message, run, duplicate: true };
  } finally {
    client.release();
  }
};

export = {
  createMessageRun,
  createThreadForUser,
  getThreadForUser,
  listThreadsForUser,
};
