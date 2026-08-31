import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { CreateAssignmentRequest } from '../../shared/contracts.js';
import { withTransaction } from '../infrastructure/transactions.js';

const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('../agents/runtime-registry.js') as {
  GRAPH_VERSION: string;
  PROMPT_BUNDLE_VERSION: string;
};

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor() {
    super('The idempotency key was already used with a different request.');
  }
}

const canonicalAssignment = (assignment: CreateAssignmentRequest) => ({
  complexity: assignment.complexity,
  description: assignment.description ?? '',
  dueDate: assignment.dueDate,
  title: assignment.title,
  totalItems: assignment.totalItems,
});

export const hashRequest = (value: unknown) => crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

export class AgentCommandService {
  constructor(private readonly pool: Pool) {}

  async createInitialPlan(input: {
    userId: number;
    assignment: CreateAssignmentRequest;
    idempotencyKey: string;
  }) {
    const requestHash = hashRequest(canonicalAssignment(input.assignment));
    try {
      return await withTransaction(this.pool, async (client) => {
        const assignmentResult = await client.query(
          `INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            input.userId,
            input.assignment.title,
            input.assignment.complexity,
            input.assignment.dueDate,
            input.assignment.totalItems,
            input.assignment.description ?? '',
          ],
        );
        const assignment = assignmentResult.rows[0];
        const runId = crypto.randomUUID();
        const runResult = await client.query(
          `INSERT INTO agent_runs (
             id, user_id, assignment_id, idempotency_key, request_hash,
             run_type, trigger_type, status, current_step, graph_version, prompt_bundle_version
           ) VALUES ($1, $2, $3, $4, $5, 'initial_plan', 'assignment_form', 'accepted', 'accepted', $6, $7)
           RETURNING *`,
          [runId, input.userId, assignment.id, input.idempotencyKey, requestHash, GRAPH_VERSION, PROMPT_BUNDLE_VERSION],
        );
        await client.query(
          `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
           VALUES ($1, 'accepted', 'accepted', 'ASSIGNMENT_ACCEPTED', 'Assignment accepted for planning.')`,
          [runId],
        );
        await client.query(
          `INSERT INTO agent_dispatch_outbox (id, run_id, task_type)
           VALUES ($1, $2, 'agent_run')`,
          [crypto.randomUUID(), runId],
        );
        return { assignment, run: runResult.rows[0], duplicate: false };
      });
    } catch (error: unknown) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') throw error;
      const existing = await this.pool.query(
        `SELECT r.*, row_to_json(a) AS assignment
         FROM agent_runs r
         JOIN assignments a ON a.id = r.assignment_id
         WHERE r.user_id = $1 AND r.idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash) throw new IdempotencyConflictError();
      const { assignment, ...run } = row;
      return { assignment, run, duplicate: true };
    }
  }
}
