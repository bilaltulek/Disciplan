import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatGoogle } from '@langchain/google';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import type { PlanTaskInput } from './agent-types.js';

const config = require('./config.env.js');
const planner = require('./gemini-planner.js');
const runs = require('./agent-runs.js');
const budget = require('./ai-usage.js');
const { validatePlan } = require('./plan-validator.js');

type PlanningContext = {
  id: string;
  user_id: number;
  status: string;
  title: string;
  description: string;
  complexity: string;
  due_date: string;
  total_items: number;
};

type Services = typeof runs & typeof budget & {
  config: typeof config;
  generateFallback: typeof planner.buildFallbackPlan;
  validatePlan: typeof validatePlan;
};

const taskSchema = z.object({
  task_description: z.string().min(3).max(500),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estimated_minutes: z.number().int().min(1).max(720),
});

const assignmentForPrompt = (context: PlanningContext) => ({
  title: context.title,
  description: context.description || '',
  complexity: context.complexity,
  dueDate: context.due_date,
  totalItems: context.total_items,
});

const createCheckpointer = () => PostgresSaver.fromConnString(config.databaseUrl, { schema: 'agent_memory' });

const isCancelled = async (runId: string, services: Services) => {
  const context = await services.getPlanningContext(runId);
  return !context || context.status === 'cancelled';
};

const plannerTools = (assignment: ReturnType<typeof assignmentForPrompt>, onDraft: (tasks: PlanTaskInput[]) => void) => [
  tool(
    async () => JSON.stringify(assignment),
    { name: 'get_planning_constraints', description: 'Read the normalized assignment constraints for this run.', schema: z.object({}) },
  ),
  tool(
    async ({ tasks }) => {
      onDraft(tasks as PlanTaskInput[]);
      return 'Candidate plan recorded for deterministic validation.';
    },
    {
      name: 'submit_candidate_plan',
      description: 'Submit the complete proposed study plan. This does not publish tasks.',
      schema: z.object({ tasks: z.array(taskSchema).min(1).max(120) }),
    },
  ),
];

const reviewerTools = (
  assignment: ReturnType<typeof assignmentForPrompt>,
  tasks: PlanTaskInput[],
  issues: string[],
  onReview: (review: string[]) => void,
) => [
  tool(async () => JSON.stringify({ assignment, tasks }), {
    name: 'get_candidate_plan', description: 'Read the assignment and candidate plan under review.', schema: z.object({}),
  }),
  tool(async () => JSON.stringify(issues), {
    name: 'get_deterministic_validation', description: 'Read deterministic validation findings for the candidate.', schema: z.object({}),
  }),
  tool(async ({ issues: submitted }) => {
    onReview(submitted);
    return 'Review decision recorded.';
  }, {
    name: 'submit_review',
    description: 'Submit concise correction issues, or an empty list when the plan is acceptable.',
    schema: z.object({ issues: z.array(z.string().min(1).max(300)).max(20) }),
  }),
];

const model = () => new ChatGoogle({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  maxOutputTokens: config.aiMaxOutputTokens,
  temperature: 0.2,
  thinkingConfig: { thinkingBudget: config.aiThinkingBudget },
});

async function invokePlanner({
  runId, userId, assignment, revisionIssues, checkpointer, services,
}: {
  runId: string; userId: number; assignment: ReturnType<typeof assignmentForPrompt>; revisionIssues: string[]; checkpointer: PostgresSaver; services: Services;
}): Promise<PlanTaskInput[] | null> {
  let candidate: PlanTaskInput[] | null = null;
  const agent = createReactAgent({
    llm: model(),
    tools: plannerTools(assignment, (tasks) => { candidate = tasks; }),
    checkpointSaver: checkpointer,
    name: 'study_plan_planner',
    prompt: `You are a bounded study-plan planning agent. Use get_planning_constraints before planning. Then call submit_candidate_plan exactly once with practical daily tasks. Do not claim tasks are published. ${revisionIssues.length ? `Correct these issues: ${revisionIssues.join('; ')}` : ''}`,
  });
  await agent.invoke({ messages: [new HumanMessage('Create a validated candidate study plan.')] }, { configurable: { thread_id: `${runId}:planner` } });
  await services.recordAiUsageEvent({ userId, endpoint: '/api/agent-runs/planner', model: services.config.geminiModel, status: services.STATUS.allowed, runId });
  return candidate;
}

async function invokeReviewer({
  runId, userId, assignment, tasks, validationIssues, checkpointer, services,
}: {
  runId: string; userId: number; assignment: ReturnType<typeof assignmentForPrompt>; tasks: PlanTaskInput[]; validationIssues: string[]; checkpointer: PostgresSaver; services: Services;
}): Promise<string[]> {
  let review: string[] = [];
  const agent = createReactAgent({
    llm: model(),
    tools: reviewerTools(assignment, tasks, validationIssues, (issues) => { review = issues; }),
    checkpointSaver: checkpointer,
    name: 'study_plan_reviewer',
    prompt: 'You are a bounded reviewer. Use the read-only tools, then call submit_review exactly once. Return [] only if no correction is needed. Never publish or create tasks.',
  });
  await agent.invoke({ messages: [new HumanMessage('Review the candidate study plan.')] }, { configurable: { thread_id: `${runId}:reviewer` } });
  await services.recordAiUsageEvent({ userId, endpoint: '/api/agent-runs/reviewer', model: services.config.geminiModel, status: services.STATUS.allowed, runId });
  return [...new Set(review.map((issue) => issue.trim()).filter(Boolean))];
}

export async function executeAgentRun(runId: string, overrides: Partial<Services> = {}) {
  const services: Services = { ...runs, ...budget, config, generateFallback: planner.buildFallbackPlan, validatePlan, ...overrides } as Services;
  const claimed = await services.claimRun(runId);
  if (!claimed) return { skipped: true };

  let reservationActive = false;
  let terminalReservationStatus = 'released';
  const checkpointer = createCheckpointer();
  try {
    await checkpointer.setup();
    const context = await services.getPlanningContext(runId) as PlanningContext | null;
    if (!context || context.status === 'cancelled') return { cancelled: true };
    const assignment = assignmentForPrompt(context);
    await services.setRunState({ runId, status: 'running', step: 'planning', detail: 'Planning agent is preparing a candidate plan.' });
    const reserved = await services.reserveRunBudget({
      runId,
      userId: context.user_id,
      reservedTotalMicroUsd: services.toMicroUsd(services.config.aiAgentRunMaxReservationUsd),
      reservedRequestCount: services.config.aiAgentMaxModelCalls,
    });
    reservationActive = !!reserved;

    let tasks: PlanTaskInput[] = [];
    let issues: string[] = [];
    let revision = 0;
    if (!services.config.geminiApiKey || !reservationActive || !await services.canUseReservedModelCall(runId)) {
      tasks = services.generateFallback({ ...assignment, userId: context.user_id });
    } else {
      tasks = (await invokePlanner({ runId, userId: context.user_id, assignment, revisionIssues: [], checkpointer, services })) || [];
    }
    issues = services.validatePlan({ tasks, assignment: context });
    if (services.config.geminiApiKey && reservationActive && !await isCancelled(runId, services)
      && await services.canUseReservedModelCall(runId)) {
      await services.setRunState({ runId, status: 'reviewing', step: 'reviewing', detail: 'Reviewer agent is checking the candidate plan.' });
      const reviewIssues = await invokeReviewer({ runId, userId: context.user_id, assignment, tasks, validationIssues: issues, checkpointer, services });
      issues = [...new Set([...issues, ...reviewIssues])];
    }

    while (issues.length > 0 && services.config.geminiApiKey && reservationActive && revision < services.config.aiAgentMaxIterations) {
      if (await isCancelled(runId, services) || !await services.canUseReservedModelCall(runId)) break;
      revision += 1;
      await services.setRunState({ runId, status: 'revising', step: 'revising', detail: 'Planning agent is revising the candidate plan.' });
      tasks = (await invokePlanner({ runId, userId: context.user_id, assignment, revisionIssues: issues, checkpointer, services })) || [];
      issues = services.validatePlan({ tasks, assignment: context });
      if (!await services.canUseReservedModelCall(runId)) break;
      await services.setRunState({ runId, status: 'reviewing', step: 'reviewing', detail: 'Reviewer agent is checking the revised candidate plan.' });
      const reviewIssues = await invokeReviewer({ runId, userId: context.user_id, assignment, tasks, validationIssues: issues, checkpointer, services });
      issues = [...new Set([...issues, ...reviewIssues])];
    }

    if (issues.length > 0) {
      tasks = services.generateFallback({ ...assignment, userId: context.user_id });
      issues = services.validatePlan({ tasks, assignment: context });
    }
    if (issues.length > 0 || await isCancelled(runId, services)) {
      await services.setRunState({ runId, status: 'failed', step: 'validation', detail: 'No valid plan could be generated.', failureCode: 'VALIDATION_FAILED', failureMessage: 'The generated plan did not meet scheduling requirements.' });
      return { failed: true };
    }
    const published = await services.publishTasks({ runId, tasks, source: services.config.geminiApiKey ? 'agentic' : 'fallback_error' });
    if (published) terminalReservationStatus = 'finalized';
    return { published, revisions: revision };
  } catch (error) {
    await services.setRunState({ runId, status: 'queued', step: 'retrying', detail: 'Agent worker will retry the run.', failureCode: 'AGENT_RUNTIME_FAILED', failureMessage: String((error as Error).message || error).slice(0, 300) });
    throw error;
  } finally {
    if (reservationActive) {
      await services.finalizeRunBudget({ runId, status: await isCancelled(runId, services) ? 'released' : terminalReservationStatus });
    }
    await checkpointer.end();
  }
}

export const deleteExpiredAgentMemory = async () => {
  const checkpointer = createCheckpointer();
  try {
    const expired = await runs.listExpiredCheckpointCleanup();
    for (const job of expired) {
      const runId = job.payload?.runId;
      if (typeof runId !== 'string') continue;
      await checkpointer.deleteThread(`${runId}:planner`);
      await checkpointer.deleteThread(`${runId}:reviewer`);
      await runs.markCheckpointCleaned(job.id);
    }
    return expired.length;
  } finally {
    await checkpointer.end();
  }
};
