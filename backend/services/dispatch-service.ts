import type { Pool } from 'pg';
import type { AgentTaskProvider } from '../infrastructure/trigger-provider.js';

const logger = require('../infrastructure/logger.js');

type OutboxRecord = { id: string; run_id: string; dispatch_key: string; attempt_count: number; user_id: number };

export class DispatchService {
  constructor(private readonly pool: Pool, private readonly provider: AgentTaskProvider) {}

  async dispatchPending(limit = 25, allowedUserIds?: readonly number[]) {
    const ownerFilter = allowedUserIds ? [...allowedUserIds] : null;
    const claimed = await this.pool.query<OutboxRecord>(
      `WITH candidates AS (
         SELECT outbox.id FROM agent_dispatch_outbox outbox
         JOIN agent_runs run ON run.id = outbox.run_id
         WHERE ((
           outbox.status IN ('pending', 'failed') AND outbox.next_attempt_at <= CURRENT_TIMESTAMP
         ) OR (
           outbox.status = 'dispatching' AND outbox.dispatch_started_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
         ))
         AND ($2::int[] IS NULL OR run.user_id = ANY($2::int[]))
         ORDER BY outbox.created_at ASC
         LIMIT $1
         FOR UPDATE OF outbox SKIP LOCKED
       )
       UPDATE agent_dispatch_outbox outbox
       SET status = 'dispatching', dispatch_started_at = CURRENT_TIMESTAMP,
           attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
       FROM candidates
       WHERE outbox.id = candidates.id
       RETURNING outbox.id, outbox.run_id, outbox.dispatch_key, outbox.attempt_count,
                 (SELECT user_id FROM agent_runs WHERE id = outbox.run_id) AS user_id`,
      [limit, ownerFilter],
    );

    const results = [];
    for (const record of claimed.rows) {
      try {
        const handle = await this.provider.triggerAgentRun(record.run_id, record.dispatch_key);
        const updated = await this.pool.query(
          `UPDATE agent_dispatch_outbox
           SET status = 'dispatched', provider_run_id = $2, dispatched_at = CURRENT_TIMESTAMP,
               last_error_code = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'dispatching'
           RETURNING id`,
          [record.id, handle.providerRunId],
        );
        await this.pool.query(
          `UPDATE agent_runs SET provider_run_id = $2,
           status = CASE WHEN status = 'accepted' THEN 'queued' ELSE status END,
           current_step = CASE WHEN status = 'accepted' THEN 'queued' ELSE current_step END,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status IN ('accepted', 'queued', 'running', 'waiting_for_input', 'waiting_for_approval')`,
          [record.run_id, handle.providerRunId],
        );
        results.push({ id: record.id, dispatched: updated.rowCount === 1 });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'TRIGGER_DISPATCH_FAILED';
        logger.warn({ err: error, runId: record.run_id, outboxId: record.id, failureCode: code }, 'Agent task dispatch failed');
        const permanent = record.attempt_count >= 3;
        await this.pool.query(
          `UPDATE agent_dispatch_outbox
           SET status = 'failed', last_error_code = $2, last_error_at = CURRENT_TIMESTAMP,
               next_attempt_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '30 seconds'), updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'dispatching'`,
          [record.id, code.slice(0, 100), Math.min(record.attempt_count, 10)],
        );
        if (permanent) {
          await this.pool.query(
            `UPDATE agent_runs SET status = 'failed', current_step = 'dispatch',
             failure_code = 'DISPATCH_RETRY_EXHAUSTED', failure_message = 'The agent task could not be started.',
             finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status IN ('accepted', 'queued')`,
            [record.run_id],
          );
        }
        results.push({ id: record.id, dispatched: false });
      }
    }
    return results;
  }
}
