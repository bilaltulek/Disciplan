import type { Pool } from 'pg';
import { withTransaction } from '../infrastructure/transactions.js';

export class RetentionService {
  constructor(private readonly pool: Pool) {}

  async enforce(now = new Date()) {
    return withTransaction(this.pool, async (client) => {
      const checkpointCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const detailCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const aggregateCutoff = new Date(now.getTime() - 13 * 31 * 24 * 60 * 60 * 1000);

      const expiredRuns = await client.query(
        `SELECT id::text FROM agent_runs
         WHERE status IN ('succeeded', 'failed', 'cancelled') AND updated_at < $1
         LIMIT 1000`,
        [checkpointCutoff],
      );
      const threadIds = expiredRuns.rows.map((row) => row.id);
      let checkpointRows = 0;
      if (threadIds.length) {
        for (const table of ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints']) {
          const deleted = await client.query(`DELETE FROM agent_memory.${table} WHERE thread_id = ANY($1::text[])`, [threadIds]);
          checkpointRows += deleted.rowCount || 0;
        }
      }

      await client.query(
        `INSERT INTO ai_usage_monthly_aggregates (
           month_start, model, request_count, prompt_tokens, output_tokens, total_micro_usd
         )
         SELECT date_trunc('month', created_at)::date, model, COUNT(*),
                COALESCE(SUM(prompt_tokens), 0), COALESCE(SUM(output_tokens), 0),
                COALESCE(SUM(estimated_total_micro_usd), 0)
         FROM ai_usage_events WHERE created_at < $1
         GROUP BY date_trunc('month', created_at)::date, model
         ON CONFLICT (month_start, model) DO UPDATE SET
           request_count = EXCLUDED.request_count,
           prompt_tokens = EXCLUDED.prompt_tokens,
           output_tokens = EXCLUDED.output_tokens,
           total_micro_usd = EXCLUDED.total_micro_usd`,
        [detailCutoff],
      );
      const events = await client.query('DELETE FROM agent_run_events WHERE created_at < $1', [detailCutoff]);
      const usage = await client.query('DELETE FROM ai_usage_events WHERE created_at < $1', [detailCutoff]);
      const rateLimits = await client.query('DELETE FROM api_rate_limits WHERE expires_at < $1', [now]);
      const aggregates = await client.query('DELETE FROM ai_usage_monthly_aggregates WHERE month_start < $1::date', [aggregateCutoff]);
      return {
        checkpointRows,
        runEvents: events.rowCount || 0,
        usageEvents: usage.rowCount || 0,
        rateLimitBuckets: rateLimits.rowCount || 0,
        aggregates: aggregates.rowCount || 0,
      };
    });
  }
}
