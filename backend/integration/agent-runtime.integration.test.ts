import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Command } from '@langchain/langgraph';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentCommandService, IdempotencyConflictError } from '../services/agent-command-service.js';
import { PlanPublishConflictError, PlanVersionService } from '../services/plan-version-service.js';
import { AssignmentRepository } from '../repositories/scoped-repositories.js';
import { createInitialGraphState } from '../agents/graph-state.js';
import { createSupervisorGraph, type SupervisorDependencies } from '../agents/supervisor-graph.js';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

const require = createRequire(__filename);
const { runMigrations } = require('../scripts/migrate.js');
const { validatePlan } = require('../plan-validator.js');
const aiUsage = require('../ai-usage.js');
const suppliedUrl = resolveSuppliedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const enabled = databaseIntegrationEnabled(process.env);

describe.skipIf(!enabled)('agent runtime Postgres integration', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  let pool: Pool;
  let connectionString: string;
  const createdUserIds: number[] = [];

  beforeAll(async () => {
    if (suppliedUrl) {
      connectionString = suppliedUrl;
      pool = new Pool({ connectionString });
    }
    else {
      container = await new PostgreSqlContainer('postgres:18-alpine').start();
      connectionString = container.getConnectionUri();
      pool = new Pool({ connectionString });
    }
    await runMigrations({ client: pool });
  }, 120_000);

  afterAll(async () => {
    if (createdUserIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);
    await pool?.end();
    await container?.stop();
  });

  const createUser = async (label: string) => {
    const result = await pool.query(
      `INSERT INTO users (email,password,name) VALUES ($1,'not-a-real-hash',$2) RETURNING id`,
      [`integration-${label}-${crypto.randomUUID()}@example.invalid`, label],
    );
    createdUserIds.push(result.rows[0].id);
    return Number(result.rows[0].id);
  };

  it('proves idempotent command creation and SQL-enforced ownership', async () => {
    const [ownerId, otherId] = await Promise.all([createUser('owner'), createUser('other')]);
    const service = new AgentCommandService(pool);
    const assignment = {
      title: 'Integration essay', description: 'Write and revise an essay.',
      complexity: 'Medium' as const, dueDate: '2099-06-30', totalItems: 6,
    };
    const first = await service.createInitialPlan({ userId: ownerId, assignment, idempotencyKey: `create-${crypto.randomUUID()}` });
    const duplicate = await service.createInitialPlan({
      userId: ownerId, assignment, idempotencyKey: first.run.idempotency_key,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.assignment.id).toBe(first.assignment.id);
    await expect(service.createInitialPlan({
      userId: ownerId,
      assignment: { ...assignment, title: 'Different payload' },
      idempotencyKey: first.run.idempotency_key,
    })).rejects.toBeInstanceOf(IdempotencyConflictError);

    const repository = new AssignmentRepository(pool);
    expect(await repository.getForActor({ userId: ownerId }, first.assignment.id)).toBeTruthy();
    expect(await repository.getForActor({ userId: otherId }, first.assignment.id)).toBeNull();
    const outbox = await pool.query('SELECT COUNT(*)::int AS count FROM agent_dispatch_outbox WHERE run_id = $1', [first.run.id]);
    expect(outbox.rows[0].count).toBe(1);
  });

  it('publishes exactly once and refuses a cancelled run', async () => {
    const userId = await createUser('publisher');
    const command = new AgentCommandService(pool);
    const planService = new PlanVersionService(pool, validatePlan);
    const created = await command.createInitialPlan({
      userId,
      idempotencyKey: `publish-${crypto.randomUUID()}`,
      assignment: { title: 'Research report', description: '', complexity: 'Hard', dueDate: '2099-07-10', totalItems: 8 },
    });
    const draft = await planService.createDraft({
      actor: { userId }, assignmentId: created.assignment.id, sourceRunId: created.run.id,
      draft: {
        rationale: 'Research before drafting.', assumptions: [],
        tasks: [
          { taskDescription: 'Research credible sources', scheduledDate: '2099-07-01', estimatedMinutes: 45 },
          { taskDescription: 'Draft the report', scheduledDate: '2099-07-02', estimatedMinutes: 60 },
        ],
      },
      today: '2099-06-01',
    });
    const firstPublish = await planService.publishInitial({
      actor: { userId }, planVersionId: draft.planVersion.id, today: '2099-06-01',
    });
    const duplicatePublish = await planService.publishInitial({
      actor: { userId }, planVersionId: draft.planVersion.id, today: '2099-06-01',
    });
    expect(firstPublish.duplicate).toBe(false);
    expect(duplicatePublish.duplicate).toBe(true);
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM plan_versions WHERE assignment_id=$1 AND status='published') AS plans,
         (SELECT COUNT(*)::int FROM study_tasks WHERE assignment_id=$1) AS tasks`,
      [created.assignment.id],
    );
    expect(counts.rows[0]).toEqual({ plans: 1, tasks: 2 });

    const cancelled = await command.createInitialPlan({
      userId,
      idempotencyKey: `cancel-${crypto.randomUUID()}`,
      assignment: { title: 'Cancelled plan', description: '', complexity: 'Easy', dueDate: '2099-08-10', totalItems: 3 },
    });
    const cancelledDraft = await planService.createDraft({
      actor: { userId }, assignmentId: cancelled.assignment.id, sourceRunId: cancelled.run.id,
      draft: { rationale: 'Test cancellation.', assumptions: [], tasks: [{ taskDescription: 'Read prompt', scheduledDate: '2099-08-01', estimatedMinutes: 30 }] },
      today: '2099-07-01',
    });
    await pool.query(
      `UPDATE agent_runs SET status='cancelled', cancellation_requested_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [cancelled.run.id],
    );
    await expect(planService.publishInitial({
      actor: { userId }, planVersionId: cancelledDraft.planVersion.id, today: '2099-07-01',
    })).rejects.toBeInstanceOf(PlanPublishConflictError);
    const cancelledTasks = await pool.query('SELECT COUNT(*)::int AS count FROM study_tasks WHERE assignment_id=$1', [cancelled.assignment.id]);
    expect(cancelledTasks.rows[0].count).toBe(0);
  });

  it('requires the exact approval hash and preserves completed work during repair', async () => {
    const userId = await createUser('repair');
    const command = new AgentCommandService(pool);
    const planService = new PlanVersionService(pool, validatePlan);
    const created = await command.createInitialPlan({
      userId,
      idempotencyKey: `repair-base-${crypto.randomUUID()}`,
      assignment: { title: 'Repairable project', description: '', complexity: 'Medium', dueDate: '2099-09-10', totalItems: 5 },
    });
    const initialDraft = await planService.createDraft({
      actor: { userId }, assignmentId: created.assignment.id, sourceRunId: created.run.id,
      draft: {
        rationale: 'Create a baseline.', assumptions: [],
        tasks: [
          { taskDescription: 'Complete research', scheduledDate: '2099-09-01', estimatedMinutes: 30 },
          { taskDescription: 'Complete draft', scheduledDate: '2099-09-02', estimatedMinutes: 45 },
        ],
      },
      today: '2099-08-01',
    });
    await planService.publishInitial({ actor: { userId }, planVersionId: initialDraft.planVersion.id, today: '2099-08-01' });
    const currentItems = await pool.query(
      'SELECT * FROM plan_version_items WHERE plan_version_id=$1 ORDER BY ordinal',
      [initialDraft.planVersion.id],
    );
    await pool.query(
      `UPDATE study_tasks SET completed=TRUE, completed_at=CURRENT_TIMESTAMP
       WHERE assignment_id=$1 AND logical_task_id=$2`,
      [created.assignment.id, currentItems.rows[0].logical_task_id],
    );
    const repairRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agent_runs (
         id,user_id,assignment_id,idempotency_key,request_hash,run_type,trigger_type,status,current_step,graph_version,prompt_bundle_version
       ) VALUES ($1,$2,$3,$4,$5,'repair','user_request','running','repair','integration','integration')`,
      [repairRunId, userId, created.assignment.id, `repair-${repairRunId}`, crypto.randomUUID()],
    );
    const repair = await planService.createRepairDraft({
      actor: { userId }, assignmentId: created.assignment.id, sourceRunId: repairRunId,
      draft: {
        rationale: 'Move only unfinished work.', assumptions: [],
        tasks: [
          {
            logicalTaskId: currentItems.rows[0].logical_task_id,
            taskDescription: currentItems.rows[0].task_description,
            scheduledDate: currentItems.rows[0].scheduled_date,
            estimatedMinutes: Number(currentItems.rows[0].estimated_minutes),
          },
          {
            logicalTaskId: currentItems.rows[1].logical_task_id,
            taskDescription: currentItems.rows[1].task_description,
            scheduledDate: '2099-09-04',
            estimatedMinutes: Number(currentItems.rows[1].estimated_minutes),
          },
        ],
      },
      today: '2099-08-01',
    });
    const approval = await planService.createApproval({
      actor: { userId }, runId: repairRunId, planVersionId: repair.planVersion.id,
    });
    await pool.query("UPDATE agent_approvals SET status='approved', decided_at=CURRENT_TIMESTAMP WHERE id=$1", [approval.id]);
    await expect(planService.publishApprovedRepair({
      actor: { userId }, approvalId: approval.id, proposalHash: '0'.repeat(64),
    })).rejects.toBeInstanceOf(PlanPublishConflictError);
    const published = await planService.publishApprovedRepair({
      actor: { userId }, approvalId: approval.id, proposalHash: approval.proposal_hash,
    });
    expect(published.duplicate).toBe(false);
    const taskRows = await pool.query(
      `SELECT logical_task_id,scheduled_date,completed,archived_at
       FROM study_tasks WHERE assignment_id=$1 ORDER BY completed DESC, scheduled_date`,
      [created.assignment.id],
    );
    expect(taskRows.rows).toHaveLength(2);
    expect(taskRows.rows.find((row) => row.completed)).toMatchObject({
      logical_task_id: currentItems.rows[0].logical_task_id,
      scheduled_date: '2099-09-01',
      archived_at: null,
    });
    expect(taskRows.rows.find((row) => !row.completed)?.scheduled_date).toBe('2099-09-04');
    const versions = await pool.query(
      'SELECT status,COUNT(*)::int AS count FROM plan_versions WHERE assignment_id=$1 GROUP BY status',
      [created.assignment.id],
    );
    expect(Object.fromEntries(versions.rows.map((row) => [row.status, row.count]))).toEqual({ published: 1, superseded: 1 });
  });

  it('keeps agent budget reservations idempotent and stops calls at either reserved limit', async () => {
    const userId = await createUser('budget');
    const command = new AgentCommandService(pool);
    const created = await command.createInitialPlan({
      userId,
      idempotencyKey: `budget-${crypto.randomUUID()}`,
      assignment: { title: 'Budgeted plan', description: '', complexity: 'Easy', dueDate: '2099-10-10', totalItems: 3 },
    });
    const reservation = {
      agentRunId: created.run.id,
      userId,
      reservedTotalMicroUsd: 100,
      reservedRequestCount: 2,
    };
    expect(await aiUsage.reserveAgentRunBudget(reservation, pool)).toBe(true);
    expect(await aiUsage.reserveAgentRunBudget(reservation, pool)).toBe(true);
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS count FROM ai_budget_reservations WHERE agent_run_id=$1 AND status='active'",
      [created.run.id],
    );
    expect(rows.rows[0].count).toBe(1);
    expect(await aiUsage.canUseReservedAgentModelCall(created.run.id, pool)).toBe(true);

    await aiUsage.recordAiUsageEvent({
      userId,
      endpoint: '/api/agent-runs/planner',
      model: 'gemini-test',
      promptTokens: 10,
      outputTokens: 10,
      totalTokens: 20,
      estimatedTotalMicroUsd: 100,
      status: aiUsage.STATUS.allowed,
      agentRunId: created.run.id,
    }, pool);
    expect(await aiUsage.canUseReservedAgentModelCall(created.run.id, pool)).toBe(false);
    const usage = await pool.query(
      `SELECT used_total_micro_usd,used_request_count
       FROM ai_budget_reservations WHERE agent_run_id=$1 AND status='active'`,
      [created.run.id],
    );
    expect(usage.rows[0]).toMatchObject({ used_total_micro_usd: '100', used_request_count: 1 });
  });

  it('resumes a clarification from a fresh graph instance using Postgres checkpoints', async () => {
    const runId = crypto.randomUUID();
    const threadId = `integration-resume-${runId}`;
    const makeDependencies = (): SupervisorDependencies => ({
      loadContext: async () => ({
        assignmentId: 1,
        assignment: { id: 1, title: 'Essay', description: '', complexity: 'Medium', dueDate: '2099-11-10', totalItems: 4 },
        planningProfile: { timezone: 'UTC', weekdayAvailableMinutes: { 1: 60 }, maxDailyMinutes: 60, preferredSessionMinutes: 30, version: 1 },
      }),
      coordinate: async (state) => state.latestUserMessage.includes('due November')
        ? { intent: 'publish_initial_plan', assignmentId: 1, missingFields: [], responseMode: 'plan' }
        : { intent: 'clarify', assignmentId: 1, missingFields: ['dueDate'], responseMode: 'question' },
      materializeAssignment: async () => ({ assignmentId: 1 }),
      createPlan: async () => ({ draft: {
        rationale: 'A restart-safe plan.', assumptions: [],
        tasks: [{ taskDescription: 'Outline the essay', scheduledDate: '2099-11-01', estimatedMinutes: 30 }],
      }, usingFallback: false }),
      repairPlan: async () => { throw new Error('repair is not expected'); },
      reviewPlan: async () => ({ accept: true, issues: [] }),
      validatePlan: async () => [],
      fallbackPlan: async () => { throw new Error('fallback is not expected'); },
      saveDraft: async () => ({ planVersionId: crypto.randomUUID(), proposalHash: 'b'.repeat(64) }),
      publishInitial: async () => undefined,
      publishRepair: async () => undefined,
      createApproval: async () => ({ approvalId: crypto.randomUUID(), proposalHash: 'b'.repeat(64) }),
      tutor: async () => ({ kind: 'tutor', answer: 'Let us work through it.', studyTips: [], suggestedActions: [], citations: [] }),
      groundResources: async (state) => state.assistantResponse || ({ kind: 'tutor', answer: 'No resources.', studyTips: [], suggestedActions: [], citations: [] }),
      answer: async () => 'Restarted plan is ready.',
    });
    const firstSaver = PostgresSaver.fromConnString(connectionString, { schema: 'agent_memory' });
    const config = { configurable: { thread_id: threadId } };
    try {
      const firstGraph = createSupervisorGraph(makeDependencies(), { checkpointer: firstSaver });
      const interrupted = await firstGraph.invoke(createInitialGraphState({
        runId, actorUserId: 42, assignmentId: 1, runType: 'conversation',
        triggerType: 'user_message', userRequest: 'Plan my essay.',
      }), config);
      expect((interrupted as typeof interrupted & { __interrupt__: unknown[] }).__interrupt__).toHaveLength(1);
    } finally {
      await firstSaver.end();
    }

    const resumedSaver = PostgresSaver.fromConnString(connectionString, { schema: 'agent_memory' });
    try {
      const resumedGraph = createSupervisorGraph(makeDependencies(), { checkpointer: resumedSaver });
      const result = await resumedGraph.invoke(new Command({ resume: { response: 'It is due November 10.' } }), config);
      expect(result.finalResponse).toBe('Restarted plan is ready.');
      await resumedSaver.deleteThread(threadId);
    } finally {
      await resumedSaver.end();
    }
  }, 30_000);
});
