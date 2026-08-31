import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { PlanDraftSchema, type PlanDraft, type PlanTaskInput } from '../../shared/contracts.js';
import { withTransaction } from '../infrastructure/transactions.js';
import { AssignmentRepository, PlanVersionRepository, type ActorContext } from '../repositories/scoped-repositories.js';

export class PlanValidationError extends Error {
  readonly code = 'PLAN_VALIDATION_FAILED';

  constructor(readonly issues: string[]) {
    super('The plan did not pass deterministic validation.');
  }
}

export class PlanPublishConflictError extends Error {
  readonly code = 'PLAN_PUBLISH_CONFLICT';

  constructor(message = 'The assignment plan changed before this plan could be published.') {
    super(message);
  }
}

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const proposalHash = (draft: PlanDraft) => crypto
  .createHash('sha256')
  .update(canonicalJson(draft))
  .digest('hex');

const deterministicTaskId = (assignmentId: number, task: PlanTaskInput, ordinal: number) => {
  const hex = crypto.createHash('sha256')
    .update(canonicalJson({ assignmentId, ordinal, task }))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const normalizeDraft = (assignmentId: number, input: unknown): PlanDraft => {
  const parsed = PlanDraftSchema.parse(input);
  return {
    ...parsed,
    tasks: parsed.tasks.map((task, ordinal) => ({
      ...task,
      logicalTaskId: task.logicalTaskId ?? deterministicTaskId(assignmentId, task, ordinal),
    })),
  };
};

export const comparePlanTasks = (before: PlanTaskInput[], after: PlanTaskInput[]) => {
  const oldById = new Map(before.map((task) => [task.logicalTaskId, task]));
  const newById = new Map(after.map((task) => [task.logicalTaskId, task]));
  return {
    added: after.filter((task) => !oldById.has(task.logicalTaskId)),
    archived: before.filter((task) => !newById.has(task.logicalTaskId)),
    moved: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old && old.scheduledDate !== task.scheduledDate;
    }),
    edited: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old && (old.taskDescription !== task.taskDescription || old.estimatedMinutes !== task.estimatedMinutes);
    }),
    retained: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old
        && old.scheduledDate === task.scheduledDate
        && old.taskDescription === task.taskDescription
        && old.estimatedMinutes === task.estimatedMinutes;
    }),
  };
};

type DeterministicValidator = (input: {
  tasks: Array<{ task_description: string; scheduled_date: string; estimated_minutes: number }>;
  assignment: Record<string, unknown>;
  profile?: Record<string, unknown>;
  existingLoad?: Record<string, number>;
  today?: string;
  completedLogicalTaskIds?: string[];
}) => string[];

export class PlanVersionService {
  constructor(
    private readonly pool: Pool,
    private readonly validate: DeterministicValidator,
  ) {}

  async createDraft(input: {
    actor: ActorContext;
    assignmentId: number;
    sourceRunId: string;
    draft: unknown;
    profile?: Record<string, unknown>;
    existingLoad?: Record<string, number>;
    today?: string;
  }) {
    const draft = normalizeDraft(input.assignmentId, input.draft);
    return withTransaction(this.pool, async (client) => {
      const assignments = new AssignmentRepository(client);
      const assignment = await assignments.requireForActor(input.actor, input.assignmentId, { forUpdate: true });
      const snakeTasks = draft.tasks.map((task) => ({
        task_description: task.taskDescription,
        scheduled_date: task.scheduledDate,
        estimated_minutes: task.estimatedMinutes,
      }));
      const issues = this.validate({
        tasks: snakeTasks,
        assignment,
        profile: input.profile,
        existingLoad: input.existingLoad,
        today: input.today,
      });
      if (issues.length) throw new PlanValidationError(issues);

      const hash = proposalHash(draft);
      const existing = await client.query(
        'SELECT * FROM plan_versions WHERE assignment_id = $1 AND proposal_hash = $2',
        [input.assignmentId, hash],
      );
      if (existing.rows[0]) return { planVersion: existing.rows[0], draft, duplicate: true };

      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM plan_versions WHERE assignment_id = $1',
        [input.assignmentId],
      );
      const planVersionId = crypto.randomUUID();
      const planResult = await client.query(
        `INSERT INTO plan_versions (
           id, assignment_id, user_id, source_run_id, version_number, status,
           proposal_hash, rationale, assumptions
         ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8::jsonb)
         RETURNING *`,
        [
          planVersionId,
          input.assignmentId,
          input.actor.userId,
          input.sourceRunId,
          Number(versionResult.rows[0].next_version),
          hash,
          draft.rationale,
          JSON.stringify(draft.assumptions),
        ],
      );
      for (const [ordinal, task] of draft.tasks.entries()) {
        await client.query(
          `INSERT INTO plan_version_items (
             id, plan_version_id, assignment_id, logical_task_id, ordinal,
             task_description, scheduled_date, estimated_minutes, operation
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'add')`,
          [
            crypto.randomUUID(),
            planVersionId,
            input.assignmentId,
            task.logicalTaskId,
            ordinal,
            task.taskDescription,
            task.scheduledDate,
            task.estimatedMinutes,
          ],
        );
      }
      return { planVersion: planResult.rows[0], draft, duplicate: false };
    });
  }

  async publishInitial(input: {
    actor: ActorContext;
    planVersionId: string;
    profile?: Record<string, unknown>;
    existingLoad?: Record<string, number>;
    today?: string;
  }) {
    return withTransaction(this.pool, async (client) => {
      const plans = new PlanVersionRepository(client);
      const plan = await plans.requireForActor(input.actor, input.planVersionId, { forUpdate: true });
      if (plan.status === 'published') return { planVersion: plan, duplicate: true };
      if (plan.status !== 'draft') throw new PlanPublishConflictError(`A ${plan.status} plan cannot be published as an initial plan.`);
      if (plan.source_run_id) {
        const run = await client.query(
          'SELECT status, cancellation_requested_at FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [plan.source_run_id, input.actor.userId],
        );
        if (!run.rows[0] || run.rows[0].status === 'cancelled' || run.rows[0].cancellation_requested_at) {
          throw new PlanPublishConflictError('A cancelled run cannot publish a plan.');
        }
      }

      const assignments = new AssignmentRepository(client);
      const assignment = await assignments.requireForActor(input.actor, plan.assignment_id, { forUpdate: true });
      const current = await client.query(
        "SELECT id FROM plan_versions WHERE assignment_id = $1 AND status = 'published'",
        [plan.assignment_id],
      );
      if (current.rows[0]) throw new PlanPublishConflictError();

      const itemsResult = await client.query(
        'SELECT * FROM plan_version_items WHERE plan_version_id = $1 ORDER BY ordinal ASC',
        [input.planVersionId],
      );
      const tasks = itemsResult.rows.map((item) => ({
        task_description: item.task_description,
        scheduled_date: item.scheduled_date,
        estimated_minutes: Number(item.estimated_minutes),
      }));
      const issues = this.validate({
        tasks,
        assignment,
        profile: input.profile,
        existingLoad: input.existingLoad,
        today: input.today,
      });
      if (issues.length) throw new PlanValidationError(issues);

      for (const item of itemsResult.rows) {
        await client.query(
          `INSERT INTO study_tasks (
             assignment_id, task_description, scheduled_date, completed,
             estimated_minutes, logical_task_id, plan_version_id
           ) VALUES ($1, $2, $3, FALSE, $4, $5, $6)`,
          [
            plan.assignment_id,
            item.task_description,
            item.scheduled_date,
            item.estimated_minutes,
            item.logical_task_id,
            plan.id,
          ],
        );
      }
      const published = await client.query(
        `UPDATE plan_versions
         SET status = 'published', published_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'draft'
         RETURNING *`,
        [plan.id],
      );
      if (!published.rows[0]) throw new PlanPublishConflictError();
      return { planVersion: published.rows[0], duplicate: false };
    });
  }

  async createRepairDraft(input: {
    actor: ActorContext;
    assignmentId: number;
    sourceRunId: string;
    draft: unknown;
    profile?: Record<string, unknown>;
    existingLoad?: Record<string, number>;
    today?: string;
  }) {
    const draft = normalizeDraft(input.assignmentId, input.draft);
    return withTransaction(this.pool, async (client) => {
      const assignments = new AssignmentRepository(client);
      const assignment = await assignments.requireForActor(input.actor, input.assignmentId, { forUpdate: true });
      const currentResult = await client.query(
        "SELECT * FROM plan_versions WHERE assignment_id = $1 AND user_id = $2 AND status = 'published' FOR UPDATE",
        [input.assignmentId, input.actor.userId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new PlanPublishConflictError('A published plan is required before it can be repaired.');
      const currentItemsResult = await client.query(
        'SELECT * FROM plan_version_items WHERE plan_version_id = $1 ORDER BY ordinal ASC',
        [current.id],
      );
      const currentTasks: PlanTaskInput[] = currentItemsResult.rows
        .filter((item) => item.operation !== 'archive')
        .map((item) => ({
          logicalTaskId: item.logical_task_id,
          taskDescription: item.task_description,
          scheduledDate: item.scheduled_date,
          estimatedMinutes: Number(item.estimated_minutes),
        }));
      const completed = await client.query(
        `SELECT logical_task_id, task_description, scheduled_date, estimated_minutes
         FROM study_tasks
         WHERE assignment_id = $1 AND completed = TRUE AND archived_at IS NULL AND logical_task_id IS NOT NULL`,
        [input.assignmentId],
      );
      const proposedById = new Map(draft.tasks.map((task) => [task.logicalTaskId, task]));
      const changedCompleted = completed.rows.some((task) => {
        const proposed = proposedById.get(task.logical_task_id);
        return !proposed
          || proposed.taskDescription !== task.task_description
          || proposed.scheduledDate !== task.scheduled_date
          || proposed.estimatedMinutes !== Number(task.estimated_minutes);
      });
      if (changedCompleted) throw new PlanValidationError(['Completed tasks cannot be changed or removed by a bulk repair.']);

      const snakeTasks = draft.tasks.map((task) => ({
        task_description: task.taskDescription,
        scheduled_date: task.scheduledDate,
        estimated_minutes: task.estimatedMinutes,
      }));
      const issues = this.validate({
        tasks: snakeTasks, assignment, profile: input.profile,
        existingLoad: input.existingLoad, today: input.today,
        completedLogicalTaskIds: completed.rows.map((task) => task.logical_task_id),
      });
      if (issues.length) throw new PlanValidationError(issues);

      const hash = proposalHash(draft);
      const existing = await client.query(
        'SELECT * FROM plan_versions WHERE assignment_id = $1 AND proposal_hash = $2',
        [input.assignmentId, hash],
      );
      if (existing.rows[0]) return { planVersion: existing.rows[0], draft, duplicate: true };
      const nextVersion = await client.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM plan_versions WHERE assignment_id = $1',
        [input.assignmentId],
      );
      const planVersionId = crypto.randomUUID();
      const planResult = await client.query(
        `INSERT INTO plan_versions (
           id, assignment_id, user_id, source_run_id, parent_plan_version_id, version_number,
           status, proposal_hash, rationale, assumptions
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', $7, $8, $9::jsonb)
         RETURNING *`,
        [planVersionId, input.assignmentId, input.actor.userId, input.sourceRunId, current.id,
          Number(nextVersion.rows[0].value), hash, draft.rationale, JSON.stringify(draft.assumptions)],
      );
      const diff = comparePlanTasks(currentTasks, draft.tasks);
      const operationFor = (task: PlanTaskInput) => {
        if (diff.added.some((item) => item.logicalTaskId === task.logicalTaskId)) return 'add';
        if (diff.edited.some((item) => item.logicalTaskId === task.logicalTaskId)) return 'edit';
        if (diff.moved.some((item) => item.logicalTaskId === task.logicalTaskId)) return 'move';
        return 'retain';
      };
      const items = [
        ...draft.tasks.map((task, ordinal) => ({ task, ordinal, operation: operationFor(task) })),
        ...diff.archived.map((task, index) => ({ task, ordinal: draft.tasks.length + index, operation: 'archive' })),
      ];
      for (const item of items) {
        await client.query(
          `INSERT INTO plan_version_items (
             id, plan_version_id, assignment_id, logical_task_id, ordinal,
             task_description, scheduled_date, estimated_minutes, operation
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [crypto.randomUUID(), planVersionId, input.assignmentId, item.task.logicalTaskId,
            item.ordinal, item.task.taskDescription, item.task.scheduledDate,
            item.task.estimatedMinutes, item.operation],
        );
      }
      return { planVersion: planResult.rows[0], draft, duplicate: false };
    });
  }

  async createApproval(input: { actor: ActorContext; runId: string; planVersionId: string; expiresAt?: Date }) {
    return withTransaction(this.pool, async (client) => {
      const plans = new PlanVersionRepository(client);
      const plan = await plans.requireForActor(input.actor, input.planVersionId, { forUpdate: true });
      if (plan.source_run_id !== input.runId || plan.status !== 'pending_approval') {
        throw new PlanPublishConflictError('This plan is not available for approval.');
      }
      const existing = await client.query(
        "SELECT * FROM agent_approvals WHERE run_id = $1 AND status = 'pending'",
        [input.runId],
      );
      if (existing.rows[0]) return existing.rows[0];
      const result = await client.query(
        `INSERT INTO agent_approvals (
           id, run_id, user_id, assignment_id, plan_version_id, proposal_hash, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [crypto.randomUUID(), input.runId, input.actor.userId, plan.assignment_id,
          plan.id, plan.proposal_hash, input.expiresAt || null],
      );
      return result.rows[0];
    });
  }

  async publishApprovedRepair(input: { actor: ActorContext; approvalId: string; proposalHash: string }) {
    return withTransaction(this.pool, async (client) => {
      const approvalResult = await client.query(
        `SELECT * FROM agent_approvals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.approvalId, input.actor.userId],
      );
      const approval = approvalResult.rows[0];
      if (!approval || approval.status !== 'approved' || approval.proposal_hash !== input.proposalHash) {
        throw new PlanPublishConflictError('Approval is missing, stale, or does not match this proposal.');
      }
      const planResult = await client.query(
        `SELECT * FROM plan_versions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [approval.plan_version_id, input.actor.userId],
      );
      const plan = planResult.rows[0];
      if (!plan || plan.status === 'published') return { planVersion: plan, duplicate: true };
      if (plan.status !== 'pending_approval') throw new PlanPublishConflictError();
      const current = await client.query(
        "SELECT * FROM plan_versions WHERE id = $1 AND assignment_id = $2 AND status = 'published' FOR UPDATE",
        [plan.parent_plan_version_id, plan.assignment_id],
      );
      if (!current.rows[0]) throw new PlanPublishConflictError('The published plan changed after this proposal was created.');
      const run = await client.query(
        `SELECT status, cancellation_requested_at FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [approval.run_id, input.actor.userId],
      );
      if (!run.rows[0] || run.rows[0].status === 'cancelled' || run.rows[0].cancellation_requested_at) {
        throw new PlanPublishConflictError('A cancelled run cannot publish a repair.');
      }
      const items = await client.query(
        'SELECT * FROM plan_version_items WHERE plan_version_id = $1 ORDER BY ordinal ASC',
        [plan.id],
      );
      await client.query(
        `UPDATE study_tasks SET archived_at = CURRENT_TIMESTAMP
         WHERE assignment_id = $1 AND completed = FALSE AND archived_at IS NULL`,
        [plan.assignment_id],
      );
      for (const item of items.rows.filter((row) => row.operation !== 'archive')) {
        const updated = await client.query(
          `UPDATE study_tasks SET task_description = $3, scheduled_date = $4, estimated_minutes = $5,
             plan_version_id = $6, archived_at = NULL
           WHERE assignment_id = $1 AND logical_task_id = $2 AND completed = FALSE
           RETURNING id`,
          [plan.assignment_id, item.logical_task_id, item.task_description,
            item.scheduled_date, item.estimated_minutes, plan.id],
        );
        if (!updated.rows[0]) {
          const completedExisting = await client.query(
            `SELECT id FROM study_tasks WHERE assignment_id = $1 AND logical_task_id = $2 AND completed = TRUE`,
            [plan.assignment_id, item.logical_task_id],
          );
          if (!completedExisting.rows[0]) {
            await client.query(
              `INSERT INTO study_tasks (
                 assignment_id, task_description, scheduled_date, completed, estimated_minutes,
                 logical_task_id, plan_version_id
               ) VALUES ($1,$2,$3,FALSE,$4,$5,$6)`,
              [plan.assignment_id, item.task_description, item.scheduled_date,
                item.estimated_minutes, item.logical_task_id, plan.id],
            );
          }
        }
      }
      await client.query("UPDATE plan_versions SET status = 'superseded' WHERE id = $1 AND status = 'published'", [current.rows[0].id]);
      const published = await client.query(
        `UPDATE plan_versions SET status = 'published', published_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending_approval' RETURNING *`,
        [plan.id],
      );
      if (!published.rows[0]) throw new PlanPublishConflictError();
      return { planVersion: published.rows[0], duplicate: false };
    });
  }
}
