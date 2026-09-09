import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../infrastructure/transactions.js';

const { todayInTimezone } = require('../domain/date-only');
const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('../agents/runtime-registry') as {
  GRAPH_VERSION: string;
  PROMPT_BUNDLE_VERSION: string;
};

export class ShadowPlanningService {
  constructor(private readonly pool: Pool) {}

  async enqueueSample(limit = 20, allowedUserIds?: readonly number[]) {
    const candidates = await this.pool.query(
      `SELECT a.id AS assignment_id, a.user_id, p.timezone, published.id AS published_plan_version_id
       FROM assignments a
       JOIN plan_versions published ON published.assignment_id = a.id AND published.status = 'published'
       LEFT JOIN user_planning_profiles p ON p.user_id = a.user_id
       WHERE a.due_date >= CURRENT_DATE
         AND ($2::int[] IS NULL OR a.user_id = ANY($2::int[]))
       ORDER BY a.created_at DESC NULLS LAST, a.id DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100), allowedUserIds ? [...allowedUserIds] : null],
    );
    const created: string[] = [];
    for (const candidate of candidates.rows) {
      const day = todayInTimezone(candidate.timezone || 'UTC');
      const runId = await withTransaction(this.pool, async (client) => {
        const id = crypto.randomUUID();
        const requestHash = crypto.createHash('sha256')
          .update(`${candidate.assignment_id}:${candidate.published_plan_version_id}:${day}`)
          .digest('hex');
        const inserted = await client.query(
          `INSERT INTO agent_runs (
             id, user_id, assignment_id, idempotency_key, request_hash, trigger_context,
             run_type, trigger_type, status, current_step, graph_version, prompt_bundle_version
           ) VALUES ($1,$2,$3,$4,$5,'{"shadow":true}'::jsonb,'initial_plan','user_request','accepted','accepted',$6,$7)
           ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`,
          [id, candidate.user_id, candidate.assignment_id, `shadow:${candidate.assignment_id}:${candidate.published_plan_version_id}:${day}`, requestHash, GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
        );
        if (!inserted.rows[0]) return null;
        await client.query(
          `INSERT INTO agent_run_events (run_id,event_type,step,detail_code,safe_detail)
           VALUES ($1,'accepted','shadow','SHADOW_EVALUATION_ACCEPTED','A non-publishing shadow evaluation was accepted.')`,
          [id],
        );
        await client.query(
          `INSERT INTO agent_dispatch_outbox (id,run_id,task_type) VALUES ($1,$2,'agent_run')`,
          [crypto.randomUUID(), id],
        );
        return id;
      });
      if (runId) created.push(runId);
    }
    return created;
  }
}
