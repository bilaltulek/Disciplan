const db = require('../db');
const config = require('../config.env');
const logger = require('./logger');
const { loadConfiguredTriggerSdk } = require('./trigger-client-config');

const dispatchRunBestEffort = async (runId) => {
  if (!process.env.TRIGGER_SECRET_KEY) return { attempted: false };
  if (config.agentRolloutMode === 'off') {
    const owned = await db.query('SELECT user_id FROM agent_runs WHERE id = $1', [runId]);
    if (!owned.rows[0] || !config.agentExecutionPolicy.canDispatchUser(owned.rows[0].user_id)) {
      return { attempted: false };
    }
  }
  const claimed = await db.query(
    `UPDATE agent_dispatch_outbox
     SET status = 'dispatching', dispatch_started_at = CURRENT_TIMESTAMP,
         attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id FROM agent_dispatch_outbox
       WHERE run_id = $1 AND status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id, dispatch_key`,
    [runId],
  );
  const outbox = claimed.rows[0];
  if (!outbox) return { attempted: false };
  try {
    const { tasks } = await loadConfiguredTriggerSdk();
    const handle = await tasks.trigger('disciplan-agent-run', { runId }, {
      idempotencyKey: `agent-run:${runId}:${outbox.dispatch_key}`,
      idempotencyKeyTTL: '30d',
      tags: [`run_${runId}`],
    });
    await db.query(
      `UPDATE agent_dispatch_outbox SET status = 'dispatched', provider_run_id = $2,
       dispatched_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'dispatching'`,
      [outbox.id, handle.id],
    );
    await db.query(
      `UPDATE agent_runs SET provider_run_id = $2,
       status = CASE WHEN status = 'accepted' THEN 'queued' ELSE status END,
       current_step = CASE WHEN status = 'accepted' THEN 'queued' ELSE current_step END,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('accepted', 'queued', 'running', 'waiting_for_input', 'waiting_for_approval')`,
      [runId, handle.id],
    );
    return { attempted: true, dispatched: true };
  } catch (error) {
    await db.query(
      `UPDATE agent_dispatch_outbox SET status = 'failed', last_error_code = 'TRIGGER_DISPATCH_FAILED',
       last_error_at = CURRENT_TIMESTAMP, next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '30 seconds', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'dispatching'`,
      [outbox.id],
    );
    logger.warn({ err: error, runId }, 'Best-effort dispatch failed; reconciler will retry');
    return { attempted: true, dispatched: false };
  }
};

module.exports = { dispatchRunBestEffort };
