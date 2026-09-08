const db = require('../db');
const logger = require('../infrastructure/logger');

const deleteAccount = async ({
  userId,
  password,
  verifyPassword,
  cancelProviderRun,
}, database = db) => {
  const cancellationClient = await database.connect();
  let runsToCancel = [];
  try {
    await cancellationClient.query('BEGIN');
    const userResult = await cancellationClient.query(
      'SELECT id,password FROM users WHERE id=$1 FOR UPDATE',
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      await cancellationClient.query('ROLLBACK');
      return { verified: false, deleted: false };
    }
    if (typeof user.password !== 'string') {
      await cancellationClient.query('ROLLBACK');
      return { verified: false, deleted: false, reauthRequired: true };
    }
    if (!await verifyPassword(password, user.password)) {
      await cancellationClient.query('ROLLBACK');
      return { verified: false, deleted: false };
    }
    const activeRuns = await cancellationClient.query(
      `SELECT id::text,provider_run_id FROM agent_runs
       WHERE user_id=$1 AND status NOT IN ('succeeded','failed','cancelled') FOR UPDATE`,
      [userId],
    );
    runsToCancel = activeRuns.rows;
    if (runsToCancel.length) {
      await cancellationClient.query(
        `UPDATE agent_runs SET status='cancelled',cancellation_requested_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP
         WHERE id::text=ANY($1::text[]) AND status NOT IN ('succeeded','failed','cancelled')`,
        [runsToCancel.map((row) => row.id)],
      );
    }
    await cancellationClient.query('COMMIT');
  } catch (error) {
    await cancellationClient.query('ROLLBACK');
    throw error;
  } finally {
    cancellationClient.release();
  }

  for (const run of runsToCancel) {
    try {
      await cancelProviderRun(run.provider_run_id);
    } catch (error) {
      logger.warn({ err: error, runId: run.id },
        'Provider cancellation failed during account deletion; canonical cancellation remains authoritative');
    }
  }

  const deletionClient = await database.connect();
  try {
    await deletionClient.query('BEGIN');
    const runIds = await deletionClient.query(
      'SELECT id::text FROM agent_runs WHERE user_id=$1 FOR UPDATE',
      [userId],
    );
    const ids = runIds.rows.map((row) => row.id);
    if (ids.length) {
      await deletionClient.query(
        `UPDATE agent_runs SET status='cancelled',cancellation_requested_at=CURRENT_TIMESTAMP
         WHERE id::text=ANY($1::text[]) AND status NOT IN ('succeeded','failed','cancelled')`,
        [ids],
      );
      for (const table of ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints']) {
        await deletionClient.query(`DELETE FROM agent_memory.${table} WHERE thread_id=ANY($1::text[])`, [ids]);
      }
    }
    const deleted = await deletionClient.query('DELETE FROM users WHERE id=$1 RETURNING id', [userId]);
    await deletionClient.query('COMMIT');
    return { verified: true, deleted: deleted.rowCount > 0 };
  } catch (error) {
    await deletionClient.query('ROLLBACK');
    throw error;
  } finally {
    deletionClient.release();
  }
};

module.exports = { deleteAccount };
