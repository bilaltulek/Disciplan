import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import crypto from 'node:crypto';
import { Command } from '@langchain/langgraph';
import type { Pool, PoolClient } from 'pg';
import { createInitialGraphState } from './graph-state.js';
import { GeminiModelGateway } from './model-gateway.js';
import { groundTutorResources } from './grounded-resources.js';
import { createSpecialists } from './specialists.js';
import { createSupervisorGraph, type SupervisorDependencies } from './supervisor-graph.js';
import { fallbackDraft } from './fallback-planner.js';
import { applyPrePublishValidationPause, resolveValidationFault } from './validation-faults.js';
import { PlanVersionService } from '../services/plan-version-service.js';
import { CreateAssignmentRequestSchema } from '../../shared/contracts.js';

const db = require('../worker-db') as Pool;
const config = require('../config.env');
const budget = require('../ai-usage');
const { validatePlan } = require('../plan-validator');
const { todayInTimezone } = require('../domain/date-only');
const { proposeMemory } = require('../preference-memories');
const logger = require('../infrastructure/logger');

const TRANSIENT_RUN_FAILURE_CODES = new Set([
  '40001', '40P01', '53300', '57P01', '08000', '08003', '08006',
  'ECONNRESET', 'ETIMEDOUT', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'TRIGGER_DISPATCH_FAILED',
  'MODEL_QUOTA_EXCEEDED', 'AGENT_RUNTIME_FAILED',
]);

export const classifyRunFailure = (error: unknown, attemptNumber: number) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'AGENT_RUNTIME_FAILED';
  return { code, terminal: attemptNumber >= 3 || !TRANSIENT_RUN_FAILURE_CODES.has(code) };
};

type RunContextRow = {
  id: string;
  thread_id: string | null;
  user_id: number;
  assignment_id: number | null;
  status: string;
  run_type: 'initial_plan' | 'conversation' | 'repair' | 'health_scan';
  trigger_type: 'assignment_form' | 'user_message' | 'user_request' | 'schedule_health';
  graph_version: string;
  prompt_bundle_version: string;
  trigger_context: { conflicts?: string[]; shadow?: boolean; validationFault?: unknown } | null;
  title: string | null;
  description: string | null;
  complexity: 'Easy' | 'Medium' | 'Hard' | null;
  due_date: string | null;
  total_items: number | null;
  message_content: string | null;
  timezone: string | null;
  weekday_available_minutes: Record<number, number> | null;
  max_daily_minutes: number | null;
  preferred_session_minutes: number | null;
  profile_version: number | null;
  published_plan_version_id: string | null;
  thread_summary: string | null;
  summary_through_message_id: string | null;
  thread_context: Record<string, unknown> | null;
};

const appendRunEvent = async (runId: string, eventType: string, step: string, detailCode: string, safeDetail: string) => {
  await db.query(
    `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [runId, eventType, step, detailCode, safeDetail],
  );
};

const loadContext = async (runId: string): Promise<RunContextRow | null> => {
  const result = await db.query<RunContextRow>(
    `SELECT r.*, a.title, a.description, a.complexity, a.due_date, a.total_items,
            p.timezone, p.weekday_available_minutes, p.max_daily_minutes,
            p.preferred_session_minutes, p.version AS profile_version,
            m.content AS message_content,
            published.id AS published_plan_version_id,
            th.summary AS thread_summary,
            th.summary_through_message_id,
            th.context_state AS thread_context
     FROM agent_runs r
     LEFT JOIN assignments a ON a.id = r.assignment_id AND a.user_id = r.user_id
     LEFT JOIN agent_messages m ON m.id = r.input_message_id AND m.user_id = r.user_id
     LEFT JOIN user_planning_profiles p ON p.user_id = r.user_id
     LEFT JOIN agent_threads th ON th.id = r.thread_id AND th.user_id = r.user_id
     LEFT JOIN LATERAL (
       SELECT id FROM plan_versions
       WHERE assignment_id = r.assignment_id AND status = 'published'
       LIMIT 1
     ) published ON TRUE
     WHERE r.id = $1`,
    [runId],
  );
  return result.rows[0] ?? null;
};

export { fallbackDraft } from './fallback-planner.js';

const safeModelFailure = (error: unknown) => {
  const candidate = error as { name?: string; code?: string; issues?: Array<{ path?: Array<string | number> }> };
  if (Array.isArray(candidate?.issues)) {
    const fields = [...new Set(candidate.issues.map((issue) => issue.path?.join('.') || 'response'))].slice(0, 8);
    return { code: 'MODEL_DRAFT_SCHEMA_INVALID', detail: `The model draft failed schema fields: ${fields.join(', ')}.` };
  }
  if (candidate?.code === 'MODEL_CALL_LIMIT') return { code: 'MODEL_DRAFT_CALL_LIMIT', detail: 'The model draft exceeded its bounded call limit.' };
  if (candidate?.code === 'MODEL_SAFETY_BLOCK') return { code: 'MODEL_DRAFT_SAFETY_BLOCK', detail: 'The model draft was blocked by provider safety controls.' };
  if (candidate?.code === 'MODEL_TIMEOUT') return { code: 'MODEL_DRAFT_TIMEOUT', detail: 'The model draft timed out safely.' };
  if (candidate?.code === 'MODEL_QUOTA_EXCEEDED') return { code: 'MODEL_DRAFT_QUOTA_EXCEEDED', detail: 'The model draft could not run within provider quota.' };
  if (candidate?.code === 'MODEL_NOT_FOUND' || candidate?.code === 'MODEL_AUTHENTICATION_FAILED' || candidate?.code === 'MODEL_REQUEST_INVALID') {
    return { code: 'MODEL_DRAFT_CONFIGURATION_FAILED', detail: 'The model draft provider configuration was rejected.' };
  }
  if (candidate?.code === 'MODEL_STRUCTURE_INVALID' || candidate?.name === 'StructuredOutputParsingError') {
    return { code: 'MODEL_DRAFT_STRUCTURE_INVALID', detail: 'The model draft did not return the required structured response.' };
  }
  return { code: 'MODEL_DRAFT_PROVIDER_FAILED', detail: 'The model draft provider call failed safely.' };
};

const acquireExecutionLock = async (runId: string) => {
  const client = await db.connect();
  const result = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [`agent-run:${runId}`]);
  if (!result.rows[0]?.acquired) {
    client.release();
    return null;
  }
  return client;
};

const releaseExecutionLock = async (client: PoolClient, runId: string) => {
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`agent-run:${runId}`]);
  } finally {
    client.release();
  }
};

export async function executeGenericAgentRun(
  runId: string,
  executionContext: { triggerEnvironmentType?: string } = {},
) {
  const lockClient = await acquireExecutionLock(runId);
  if (!lockClient) return { skipped: true, reason: 'already_running' };
  let reservationActive = false;
  let usageAccountingHealthy = true;
  let attemptNumber = 0;
  try {
    const claimed = await db.query(
      `UPDATE agent_runs SET status = 'running', current_step = 'context',
       attempt_number = attempt_number + CASE WHEN EXISTS (
         SELECT 1 FROM agent_run_resumes rr WHERE rr.run_id=agent_runs.id AND rr.status='pending'
       ) THEN 0 ELSE 1 END,
       resume_count = resume_count + CASE WHEN EXISTS (
         SELECT 1 FROM agent_run_resumes rr WHERE rr.run_id=agent_runs.id AND rr.status='pending'
       ) THEN 1 ELSE 0 END,
       started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('accepted', 'queued', 'running') AND cancellation_requested_at IS NULL
       RETURNING *`,
      [runId],
    );
    if (!claimed.rows[0]) return { skipped: true, reason: 'terminal_or_cancelled' };
    attemptNumber = Number(claimed.rows[0].attempt_number || 0);
    const context = await loadContext(runId);
    if (!context) throw Object.assign(new Error('Agent run context was not found.'), { code: 'RUN_CONTEXT_MISSING' });
    const validationFault = resolveValidationFault({
      policy: config.agentExecutionPolicy,
      userId: context.user_id,
      triggerContext: context.trigger_context,
      triggerEnvironmentType: executionContext.triggerEnvironmentType,
    });
    const resumeResult = await db.query(
      `SELECT rr.id, m.content
       FROM agent_run_resumes rr JOIN agent_messages m ON m.id = rr.message_id
       WHERE rr.run_id = $1 AND rr.user_id = $2 AND rr.status = 'pending'
       ORDER BY rr.created_at ASC LIMIT 1`,
      [runId, context.user_id],
    );
    const pendingResume = resumeResult.rows[0] || null;
    const decidedApprovalResult = await db.query(
      `SELECT id, status, proposal_hash FROM agent_approvals
       WHERE run_id = $1 AND user_id = $2 AND status IN ('approved', 'rejected')
       ORDER BY decided_at DESC LIMIT 1`,
      [runId, context.user_id],
    );
    const decidedApproval = decidedApprovalResult.rows[0] || null;
    await appendRunEvent(runId, 'running', 'context', 'RUN_STARTED', 'Agent planning started.');
    if (validationFault === 'transient_once_before_graph' && attemptNumber === 1) {
      throw Object.assign(new Error('A development validation transient failure was requested.'), {
        code: 'AGENT_RUNTIME_FAILED',
      });
    }

    reservationActive = await budget.reserveAgentRunBudget({
      agentRunId: runId,
      userId: context.user_id,
      reservedTotalMicroUsd: budget.toMicroUsd(config.aiAgentRunMaxReservationUsd),
      reservedRequestCount: config.aiAgentMaxModelCalls,
    });

    const createGateway = (modelName: string) => new GeminiModelGateway({
      apiKey: reservationActive ? config.geminiApiKey : '', modelName,
      maxOutputTokens: config.aiMaxOutputTokens, thinkingBudget: config.aiThinkingBudget,
      onUsage: async ({ role, actorUserId, usage }) => {
        const estimated = budget.estimateCostMicroUsd({
          model: modelName,
          promptTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
        try {
          await budget.recordAiUsageEvent({
            userId: actorUserId,
            endpoint: `/api/agent-runs/${role}`,
            model: modelName,
            promptTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            ...estimated,
            status: budget.STATUS.allowed,
            agentRunId: runId,
          });
        } catch (error) {
          // A successful provider call that cannot be accounted for must stop
          // every later model call in this run. The specialist invocation is
          // failed as well so the graph takes its deterministic fallback path.
          usageAccountingHealthy = false;
          throw Object.assign(new Error('AI usage accounting failed.'), { code: 'AI_USAGE_ACCOUNTING_FAILED', cause: error });
        }
      },
    });
    const routerGateway = createGateway(config.geminiRouterModel);
    const agentGateway = createGateway(config.geminiAgentModel);
    const searchGateway = createGateway(config.geminiSearchModel);
    const specialists = reservationActive && config.geminiApiKey ? createSpecialists(routerGateway, {
      gatewayForRole: (role) => role === 'coordinator' || role === 'reviewer' ? routerGateway : agentGateway,
      maxModelCalls: config.aiAgentMaxModelCalls,
      maxToolCalls: config.aiAgentMaxToolCalls,
      auditTool: async (event) => {
        await db.query(
          `INSERT INTO agent_run_events (
             run_id,event_type,step,detail_code,safe_detail,resource_refs,duration_ms
           ) VALUES ($1,'tool','specialist',$2,$3,$4::jsonb,$5)`,
          [event.runId, event.resultCode, `Tool ${event.toolName} completed with ${event.resultCode}.`,
            JSON.stringify(event.resourceIds), event.durationMs],
        );
      },
    }) : null;
    await db.query(
      `UPDATE agent_runs SET model_provider=$2,model_name=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='running'`,
      [runId, specialists ? agentGateway.provider : null, specialists ? config.geminiAgentModel : null],
    );
    const planVersions = new PlanVersionService(db, validatePlan);
    const profile = {
      timezone: context.timezone || 'UTC',
      weekdayAvailableMinutes: context.weekday_available_minutes || { 0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 },
      maxDailyMinutes: context.max_daily_minutes || 120,
      preferredSessionMinutes: context.preferred_session_minutes || 45,
      version: context.profile_version || 1,
    };
    const loadResult = context.assignment_id
      ? await db.query(
        `SELECT t.scheduled_date, COALESCE(SUM(t.estimated_minutes), 0)::int AS minutes
         FROM study_tasks t JOIN assignments a ON a.id = t.assignment_id
         WHERE a.user_id = $1 AND a.id <> $2 AND t.completed = FALSE AND t.archived_at IS NULL
         GROUP BY t.scheduled_date`,
        [context.user_id, context.assignment_id],
      )
      : { rows: [] };
    const existingLoad = Object.fromEntries(loadResult.rows.map((row) => [row.scheduled_date, Number(row.minutes)]));
    const [conversationResult, memoriesResult, assignmentsResult, tasksResult] = await Promise.all([
      context.thread_id
        ? db.query(
          `WITH boundary AS (
             SELECT created_at,id FROM agent_messages
             WHERE id=$3::uuid AND thread_id=$1 AND user_id=$2
           )
           SELECT id,role,content FROM agent_messages
           WHERE thread_id=$1 AND user_id=$2
             AND ($3::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM boundary)
               OR (created_at,id) > (SELECT created_at,id FROM boundary))
           ORDER BY created_at DESC,id DESC LIMIT 60`,
          [context.thread_id, context.user_id, context.summary_through_message_id],
        )
        : Promise.resolve({ rows: [] }),
      db.query(
        `SELECT memory_key,memory_value FROM user_preference_memories
         WHERE user_id=$1 AND status='confirmed' ORDER BY updated_at DESC LIMIT 20`,
        [context.user_id],
      ),
      db.query(
        `SELECT id,title,LEFT(description,1000) AS description,complexity,due_date
         FROM assignments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [context.user_id],
      ),
      db.query(
        `SELECT st.id,st.assignment_id,LEFT(st.task_description,500) AS task_description,
                st.scheduled_date,st.completed
         FROM study_tasks st JOIN assignments a ON a.id=st.assignment_id
         WHERE a.user_id=$1 AND st.archived_at IS NULL
         ORDER BY st.scheduled_date ASC,st.id ASC LIMIT 60`,
        [context.user_id],
      ),
    ]);
    const orderedMessages = conversationResult.rows.reverse();
    const recentMessages = [] as Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
    let remainingContextCharacters = 96_000;
    for (const row of [...orderedMessages].reverse()) {
      const content = String(row.content).slice(0, 4_000);
      if (content.length > remainingContextCharacters) break;
      recentMessages.unshift({ id: row.id, role: row.role, content });
      remainingContextCharacters -= content.length;
    }
    const conversationSummary = [context.thread_summary || '', ...recentMessages.map((row) => `${row.role}: ${row.content}`)]
      .filter(Boolean).join('\n').slice(-96_000);
    const persistedContext = context.thread_context && typeof context.thread_context === 'object'
      ? context.thread_context as { collectedContext?: Record<string, unknown>; originalGoal?: string; activeTutorTopic?: string }
      : {};
    const confirmedMemories = Object.fromEntries(memoriesResult.rows.map((row) => [
      row.memory_key,
      typeof row.memory_value === 'string' ? row.memory_value : JSON.stringify(row.memory_value),
    ]));
    const availableAssignments = assignmentsResult.rows.map((row) => ({
      id: row.id, title: row.title, description: row.description || '', dueDate: row.due_date, complexity: row.complexity,
    }));
    const availableTasks = tasksResult.rows.map((row) => ({
      id: row.id, assignmentId: row.assignment_id, description: row.task_description,
      scheduledDate: row.scheduled_date, completed: row.completed,
    }));
    const publishedItemsResult = context.published_plan_version_id
      ? await db.query(
        `SELECT pvi.logical_task_id,pvi.task_description,pvi.scheduled_date,pvi.estimated_minutes,
                COALESCE(st.completed,FALSE) AS completed
         FROM plan_version_items pvi
         LEFT JOIN study_tasks st ON st.assignment_id=pvi.assignment_id
           AND st.logical_task_id=pvi.logical_task_id AND st.archived_at IS NULL
         WHERE pvi.plan_version_id=$1 AND pvi.operation <> 'archive'
         ORDER BY pvi.ordinal`,
        [context.published_plan_version_id],
      )
      : { rows: [] };
    const existingPlan = publishedItemsResult.rows.map((row) => ({
      logicalTaskId: row.logical_task_id,
      taskDescription: row.task_description,
      scheduledDate: row.scheduled_date,
      estimatedMinutes: Number(row.estimated_minutes),
    }));
    const completedLogicalTaskIds = publishedItemsResult.rows
      .filter((row) => row.completed)
      .map((row) => row.logical_task_id);

    let alignmentFailureObserved = false;
    let fallbackReason: 'limit' | 'error' | null = null;
    const dependencies: SupervisorDependencies = {
      loadContext: async () => ({
        assignmentId: context.assignment_id,
        assignment: context.assignment_id && context.title && context.complexity && context.due_date
          ? {
            id: context.assignment_id, title: context.title, description: context.description || '',
            complexity: context.complexity, dueDate: context.due_date, totalItems: Number(context.total_items),
          }
          : null,
        planningProfile: profile,
        planningDate: todayInTimezone(profile.timezone),
        existingPlanVersionId: context.published_plan_version_id,
        existingPlan,
        completedLogicalTaskIds,
        conversationSummary,
        conversationMessages: recentMessages,
        collectedContext: persistedContext.collectedContext || {},
        originalGoal: persistedContext.originalGoal || context.message_content || '',
        latestUserMessage: recentMessages.filter((message) => message.role === 'user').at(-1)?.content || context.message_content || '',
        activeTutorTopic: persistedContext.activeTutorTopic || null,
        confirmedMemories,
        availableAssignments,
        availableTasks,
        existingLoad,
        detectedConflicts: context.trigger_context?.conflicts || [],
      }),
      coordinate: async (state) => context.trigger_type === 'assignment_form' || context.trigger_context?.shadow
        ? { intent: 'publish_initial_plan', assignmentId: context.assignment_id, missingFields: [], responseMode: 'plan' }
        : context.run_type === 'repair' || context.trigger_type === 'schedule_health'
          ? { intent: 'repair_plan', assignmentId: context.assignment_id, missingFields: [], responseMode: 'plan' }
        : specialists
          ? specialists.coordinate(state)
          : Promise.reject(Object.assign(new Error('Conversational model execution is unavailable.'), { code: 'MODEL_UNAVAILABLE' })),
      materializeAssignment: async (state) => {
        const supplied = { ...state.collectedContext, ...state.intent?.contextDelta, ...state.intent?.normalizedAssignment };
        if (!supplied.dueDate) {
          throw Object.assign(new Error('A due date is required before scheduling persistent work.'), { code: 'ASSIGNMENT_DUE_DATE_REQUIRED' });
        }
        const normalized = CreateAssignmentRequestSchema.parse({
          title: supplied.title || supplied.topic || state.originalGoal.trim().slice(0, 120) || 'Study plan',
          description: supplied.description || supplied.learningGoal || state.originalGoal,
          complexity: supplied.complexity || 'Medium',
          dueDate: supplied.dueDate,
          totalItems: supplied.totalItems || 6,
        });
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const assignmentResult = await client.query(
            `INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [state.actorUserId, normalized.title, normalized.complexity, normalized.dueDate, normalized.totalItems, normalized.description || ''],
          );
          const assignment = assignmentResult.rows[0];
          const linked = await client.query(
            `UPDATE agent_runs SET assignment_id = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $3 AND assignment_id IS NULL AND status = 'running'
             RETURNING id`,
            [state.runId, assignment.id, state.actorUserId],
          );
          if (!linked.rows[0]) throw new Error('The run could not be linked to the new assignment.');
          await client.query('COMMIT');
          return {
            assignmentId: assignment.id,
            assignment: {
              id: assignment.id, title: assignment.title, description: assignment.description || '',
              complexity: assignment.complexity, dueDate: assignment.due_date, totalItems: Number(assignment.total_items),
            },
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      createPlan: async (state) => {
        if (!specialists || !usageAccountingHealthy || !await budget.canUseReservedAgentModelCall(runId)) {
          fallbackReason = 'limit';
          return { draft: fallbackDraft(state), usingFallback: true };
        }
        try {
          return { draft: await specialists.createPlan(state), usingFallback: false };
        } catch (error) {
          fallbackReason = 'error';
          const failure = safeModelFailure(error);
          await appendRunEvent(runId, 'fallback', 'planner', failure.code, failure.detail);
          return { draft: fallbackDraft(state), usingFallback: true };
        }
      },
      repairPlan: async (state) => {
        if (!specialists || !usageAccountingHealthy || !await budget.canUseReservedAgentModelCall(runId)) {
          fallbackReason = 'limit';
          return { draft: fallbackDraft(state), usingFallback: true };
        }
        try {
          return { draft: await specialists.repairPlan(state), usingFallback: false };
        } catch (error) {
          fallbackReason = 'error';
          const failure = safeModelFailure(error);
          await appendRunEvent(runId, 'fallback', 'repair', failure.code.replace('DRAFT', 'REPAIR'), failure.detail.replace('draft', 'repair'));
          return { draft: fallbackDraft(state), usingFallback: true };
        }
      },
      reviewPlan: async (state) => {
        if (!specialists || !usageAccountingHealthy || !await budget.canUseReservedAgentModelCall(runId)) return { accept: true, issues: [] };
        try {
          return await specialists.reviewPlan(state);
        } catch (error) {
          await appendRunEvent(runId, 'review', 'reviewer', 'MODEL_REVIEW_FAILED', 'Semantic review was unavailable; deterministic validation remained authoritative.');
          return { accept: true, issues: [] };
        }
      },
      validatePlan: async (state) => {
        if (!state.candidatePlan || !state.assignment) return ['A candidate plan is required.'];
        const issues = validatePlan({
          tasks: state.candidatePlan.tasks.map((task) => ({
            task_description: task.taskDescription,
            scheduled_date: task.scheduledDate,
            estimated_minutes: task.estimatedMinutes,
            logical_task_id: task.logicalTaskId,
          })),
          assignment: {
            title: state.assignment.title,
            description: state.assignment.description,
            dueDate: state.assignment.dueDate,
          },
          profile: state.planningProfile,
          existingLoad: state.existingLoad,
          today: state.planningDate || undefined,
          completedLogicalTaskIds: state.completedLogicalTaskIds,
        });
        if (!alignmentFailureObserved && issues.some((issue: string) => issue.startsWith('[CONTENT_ALIGNMENT_FAILED]'))) {
          alignmentFailureObserved = true;
          await appendRunEvent(
            runId,
            'validation',
            'validation',
            'CONTENT_ALIGNMENT_FAILED',
            'The candidate plan did not cover all explicitly requested focus topics.',
          );
        }
        return issues;
      },
      fallbackPlan: fallbackDraft,
      saveDraft: async (state) => {
        if (!state.candidatePlan || !state.assignmentId) throw new Error('A candidate plan is required.');
        const method = state.shadowMode
          ? planVersions.createDraft.bind(planVersions)
          : state.intent?.intent === 'repair_plan' || state.existingPlanVersionId
          ? planVersions.createRepairDraft.bind(planVersions)
          : planVersions.createDraft.bind(planVersions);
        const saved = await method({
          actor: { userId: state.actorUserId }, assignmentId: state.assignmentId,
          sourceRunId: state.runId, draft: state.candidatePlan, profile: state.planningProfile || undefined,
          existingLoad: state.existingLoad,
        });
        return { planVersionId: saved.planVersion.id, proposalHash: saved.planVersion.proposal_hash };
      },
      publishInitial: async (state) => {
        if (!state.planVersionId) throw new Error('A plan version is required.');
        await applyPrePublishValidationPause(validationFault);
        await planVersions.publishInitial({
          actor: { userId: state.actorUserId }, planVersionId: state.planVersionId,
          profile: state.planningProfile || undefined, existingLoad: state.existingLoad,
        });
      },
      publishRepair: async (state) => {
        if (!state.approvalId || !state.proposalHash) throw new Error('An exact approval is required.');
        await applyPrePublishValidationPause(validationFault);
        await planVersions.publishApprovedRepair({
          actor: { userId: state.actorUserId }, approvalId: state.approvalId, proposalHash: state.proposalHash,
        });
      },
      createApproval: async (state) => {
        if (!state.planVersionId) throw new Error('A plan version is required.');
        const approval = await planVersions.createApproval({
          actor: { userId: state.actorUserId }, runId: state.runId, planVersionId: state.planVersionId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        return { approvalId: approval.id, proposalHash: approval.proposal_hash };
      },
      tutor: async (state) => {
        if (!specialists || !usageAccountingHealthy || !await budget.canUseReservedAgentModelCall(runId)) {
          throw Object.assign(new Error('Conversational model execution is unavailable.'), { code: 'MODEL_UNAVAILABLE' });
        }
        return specialists.tutor(state);
      },
      groundResources: async (state) => {
        const monthly = await db.query(
          `SELECT COUNT(*)::int AS count FROM agent_run_events e JOIN agent_runs r ON r.id=e.run_id
           WHERE r.user_id=$1 AND e.detail_code='GOOGLE_SEARCH_COMPLETED'
             AND e.created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
          [context.user_id],
        );
        if (Number(monthly.rows[0]?.count || 0) >= config.aiSearchMonthlyRequestLimit) {
          return { ...(state.assistantResponse!), citations: [], answer: `${state.assistantResponse?.answer || ''}\n\nVerified resource search has reached its monthly limit.` };
        }
        try {
          const response = await groundTutorResources({ state, gateway: searchGateway });
          await appendRunEvent(runId, 'tool', 'resources', 'GOOGLE_SEARCH_COMPLETED', 'Grounded resource lookup completed.');
          return response;
        } catch (error) {
          await appendRunEvent(runId, 'tool', 'resources', 'GOOGLE_SEARCH_FAILED', 'Grounded resource lookup was unavailable.');
          return { ...(state.assistantResponse!), citations: [], answer: `${state.assistantResponse?.answer || ''}\n\nI could not retrieve verified links right now.` };
        }
      },
      answer: (state) => state.failureCode
        ? 'No safe plan could be created with the current constraints.'
        : state.assistantResponse?.answer
          ? state.assistantResponse.answer
        : state.shadowMode
          ? 'Shadow plan evaluation completed without changing the published plan.'
        : state.approvalDecision?.decision === 'reject'
          ? 'The proposed plan changes were rejected. Your published plan was not changed.'
        : state.intent?.answer || (state.intent?.responseMode === 'question'
          ? state.intent.clarificationQuestion || 'What detail would help me continue?'
        : state.usingFallback || fallbackReason
          ? 'Your plan is ready. A deterministic fallback was used.'
          : 'Your plan is ready.'),
    };

    const checkpointer = PostgresSaver.fromConnString(config.agentDatabaseUrl, { schema: 'agent_memory' });
    try {
      const graph = createSupervisorGraph(dependencies, { checkpointer });
      const graphInput: Parameters<typeof graph.invoke>[0] = decidedApproval
        ? new Command({ resume: {
          decision: decidedApproval.status === 'approved' ? 'approve' : 'reject',
          proposalHash: decidedApproval.proposal_hash,
        } }) as Parameters<typeof graph.invoke>[0]
        : pendingResume
          ? new Command({ resume: { response: pendingResume.content } }) as Parameters<typeof graph.invoke>[0]
        : createInitialGraphState({
          runId,
          threadId: context.thread_id,
          actorUserId: context.user_id,
          assignmentId: context.assignment_id,
          runType: context.run_type,
          triggerType: context.trigger_type,
          userRequest: context.trigger_type === 'assignment_form'
            ? 'Create a study plan for this assignment.'
            : context.message_content || '',
          conversationSummary,
          confirmedMemories,
          graphVersion: context.graph_version,
          promptBundleVersion: context.prompt_bundle_version,
          shadowMode: Boolean(context.trigger_context?.shadow),
        });
      const result = await graph.invoke(graphInput, {
        configurable: { thread_id: runId },
        recursionLimit: 30,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      const interrupts = '__interrupt__' in result
        ? result.__interrupt__ as Array<{ value?: { type?: string; missingFields?: string[]; question?: string } }>
        : [];
      if (pendingResume) {
        await db.query(
          `UPDATE agent_run_resumes SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'pending'`,
          [pendingResume.id],
        );
      }
      if (interrupts.length) {
        const waitingForApproval = interrupts.some((item) => item.value?.type === 'approval');
        const status = waitingForApproval ? 'waiting_for_approval' : 'waiting_for_input';
        const safeDetail = waitingForApproval
          ? 'A plan change is waiting for student approval.'
          : 'The assistant is waiting for one clarification.';
        await db.query(
          `UPDATE agent_runs SET status = $2, current_step = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'running' AND cancellation_requested_at IS NULL`,
          [runId, status],
        );
        await appendRunEvent(runId, status, status, waitingForApproval ? 'APPROVAL_REQUIRED' : 'CLARIFICATION_REQUIRED', safeDetail);
        if (context.thread_id) {
          const assistantMessageId = crypto.randomUUID();
          const assistantContent = waitingForApproval
            ? safeDetail
            : interrupts[0]?.value?.question || 'What detail would help me continue?';
          await db.query(
            `INSERT INTO agent_messages (id, thread_id, user_id, role, content, content_metadata)
             VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)`,
            [assistantMessageId, context.thread_id, context.user_id, assistantContent,
              JSON.stringify({ kind: waitingForApproval ? 'proposal' : 'clarification', runId })],
          );
          await db.query(
            `UPDATE agent_threads SET summary=$2,summary_updated_at=CURRENT_TIMESTAMP,
             summary_through_message_id=$3,context_state=$4::jsonb,context_version=context_version+1,
             last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$5`,
            [context.thread_id, `${conversationSummary}\nassistant: ${assistantContent}`.slice(-16_000), assistantMessageId, JSON.stringify({
              originalGoal: result.originalGoal,
              collectedContext: result.collectedContext,
              activeTutorTopic: result.activeTutorTopic,
            }), context.user_id],
          );
        }
        if (reservationActive) await budget.finalizeAgentRunBudget({ agentRunId: runId, status: 'released' });
        reservationActive = false;
        return { waiting: true, status };
      }
      const failed = Boolean(result.failureCode);
      await db.query(
        `UPDATE agent_runs SET status = $2, current_step = $3, failure_code = $4,
         failure_message = $5, plan_source = $6, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'running' AND cancellation_requested_at IS NULL`,
        [
          runId, failed ? 'failed' : 'succeeded', failed ? 'validation' : 'completed',
          result.failureCode, failed ? result.finalResponse : null,
          result.usingFallback || fallbackReason === 'error'
            ? 'fallback_error'
            : fallbackReason === 'limit' || !specialists
              ? 'fallback_limit'
              : 'agentic',
        ],
      );
      const completionCode = failed
        ? 'PLAN_FAILED'
        : result.planVersionId
          ? 'PLAN_PUBLISHED'
          : result.assistantResponse?.kind === 'tutor'
            ? 'TUTOR_RESPONSE_COMPLETED'
            : 'ASSISTANT_RESPONSE_COMPLETED';
      await appendRunEvent(
        runId, failed ? 'failed' : 'succeeded', failed ? 'validation' : 'completed', completionCode,
        failed ? 'The agent run could not produce a valid plan.' : 'The agent run completed safely.',
      );
      if (context.thread_id && result.finalResponse) {
        const assistantMessageId = crypto.randomUUID();
        await db.query(
          `INSERT INTO agent_messages (id, thread_id, user_id, role, content, content_metadata)
           VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)`,
          [assistantMessageId, context.thread_id, context.user_id, result.finalResponse, JSON.stringify({
            kind: result.assistantResponse?.kind || (failed ? 'failure' : result.planVersionId ? 'plan' : 'answer'),
            runId,
            citations: result.assistantResponse?.citations || [],
            suggestedActions: result.assistantResponse?.suggestedActions || [],
            planSource: result.planVersionId ? (result.usingFallback ? 'fallback' : 'agentic') : undefined,
          })],
        );
        await db.query(
          `UPDATE agent_threads SET summary=$2,summary_updated_at=CURRENT_TIMESTAMP,
           summary_through_message_id=$4,context_state=$5::jsonb,
           context_version=context_version+1,
           last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND user_id=$3`,
          [context.thread_id, `${conversationSummary}\nassistant: ${result.finalResponse}`.slice(-16_000), context.user_id,
            assistantMessageId,
            JSON.stringify({ originalGoal: result.originalGoal, collectedContext: result.collectedContext, activeTutorTopic: result.activeTutorTopic })],
        );
      }
      if (result.intent?.preferenceProposal) {
        await proposeMemory({
          userId: context.user_id,
          runId,
          key: result.intent.preferenceProposal.key,
          value: result.intent.preferenceProposal.value,
        });
      }
      if (reservationActive) await budget.finalizeAgentRunBudget({ agentRunId: runId, status: failed ? 'released' : 'finalized' });
      reservationActive = false;
      return { succeeded: !failed, result };
    } finally {
      await checkpointer.end();
    }
  } catch (error) {
    const { code, terminal } = classifyRunFailure(error, attemptNumber);
    logger.error({ err: error, runId, failureCode: code }, 'Agent run execution failed');
    await db.query(
      `UPDATE agent_runs SET status = $2, current_step = $3, failure_code = $4,
       failure_message = $5, finished_at = CASE WHEN $2='failed' THEN CURRENT_TIMESTAMP ELSE finished_at END,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'running' AND cancellation_requested_at IS NULL`,
      [runId, terminal ? 'failed' : 'queued', terminal ? 'failed' : 'retrying', code.slice(0, 100),
        terminal ? 'The agent run could not complete safely.' : 'A temporary dependency failure will be retried.'],
    );
    await appendRunEvent(
      runId, terminal ? 'failed' : 'retrying', terminal ? 'failed' : 'retrying',
      code.slice(0, 100), terminal ? 'The agent run reached a safe terminal failure.' : 'A transient failure will be retried.',
    );
    if (terminal) {
      await db.query(
        `INSERT INTO agent_messages (id,thread_id,user_id,role,content,content_metadata)
         SELECT $2,r.thread_id,r.user_id,'assistant',$3,$4::jsonb
         FROM agent_runs r
         WHERE r.id=$1 AND r.thread_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM agent_messages m
             WHERE m.thread_id=r.thread_id AND m.user_id=r.user_id
               AND m.role='assistant' AND m.content_metadata->>'runId'=$1
               AND m.content_metadata->>'kind'='failure'
           )`,
        [runId, crypto.randomUUID(),
          'I saved your message, but I could not generate a response right now. Please try this turn again.',
          JSON.stringify({ kind: 'failure', runId, suggestedActions: [{ label: 'Try again', prompt: 'Please try my last request again.' }] })],
      );
      return { succeeded: false, failureCode: code };
    }
    throw error;
  } finally {
    if (reservationActive) await budget.finalizeAgentRunBudget({ agentRunId: runId, status: 'released' });
    await releaseExecutionLock(lockClient, runId);
  }
}
