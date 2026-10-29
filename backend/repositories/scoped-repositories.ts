import type { Queryable } from '../infrastructure/transactions.js';

export type ActorContext = Readonly<{ userId: number }>;

export class ResourceNotFoundError extends Error {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} was not found.`);
  }
}

export class AssignmentRepository {
  constructor(private readonly db: Queryable) {}

  async getForActor(actor: ActorContext, assignmentId: number, options: { forUpdate?: boolean } = {}) {
    const lock = options.forUpdate ? ' FOR UPDATE' : '';
    const result = await this.db.query(
      `SELECT * FROM assignments WHERE id = $1 AND user_id = $2${lock}`,
      [assignmentId, actor.userId],
    );
    return result.rows[0] ?? null;
  }

  async requireForActor(actor: ActorContext, assignmentId: number, options: { forUpdate?: boolean } = {}) {
    const assignment = await this.getForActor(actor, assignmentId, options);
    if (!assignment) throw new ResourceNotFoundError('Assignment');
    return assignment;
  }
}

export class AgentRunRepository {
  constructor(private readonly db: Queryable) {}

  async getForActor(actor: ActorContext, runId: string, options: { forUpdate?: boolean } = {}) {
    const lock = options.forUpdate ? ' FOR UPDATE' : '';
    const result = await this.db.query(
      `SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2${lock}`,
      [runId, actor.userId],
    );
    return result.rows[0] ?? null;
  }

  async requireForActor(actor: ActorContext, runId: string, options: { forUpdate?: boolean } = {}) {
    const run = await this.getForActor(actor, runId, options);
    if (!run) throw new ResourceNotFoundError('Agent run');
    return run;
  }
}

export class PlanVersionRepository {
  constructor(private readonly db: Queryable) {}

  async getForActor(actor: ActorContext, planVersionId: string, options: { forUpdate?: boolean } = {}) {
    const lock = options.forUpdate ? ' FOR UPDATE' : '';
    const result = await this.db.query(
      `SELECT * FROM plan_versions WHERE id = $1 AND user_id = $2${lock}`,
      [planVersionId, actor.userId],
    );
    return result.rows[0] ?? null;
  }

  async requireForActor(actor: ActorContext, planVersionId: string, options: { forUpdate?: boolean } = {}) {
    const plan = await this.getForActor(actor, planVersionId, options);
    if (!plan) throw new ResourceNotFoundError('Plan version');
    return plan;
  }
}
