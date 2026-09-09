import { createInitialGraphState } from '../agents/graph-state.js';
import { GeminiModelGateway } from '../agents/model-gateway.js';
import { createSpecialists } from '../agents/specialists.js';
import { buildScheduleResponse } from '../agents/supervisor-graph.js';
import { fallbackDraft } from '../agents/fallback-planner.js';
import type { PlanDraft } from '../../shared/contracts.js';
import { evaluationDataset } from './dataset.js';
import { resolveCanarySelection, waitForCanaryPacing } from './canary-config.js';
import {
  assertReleaseGates, classifyEvaluationFailure, evaluateOutcomes, evaluationFailureIssueCodes,
  type EvaluationOutcome,
} from './evaluator.js';

const config = require('../config.env');
const { addDays, todayInTimezone } = require('../domain/date-only');
const { validatePlan } = require('../plan-validator');
const budget = require('../ai-usage');

const tasksForValidation = (tasks: Array<{
  taskDescription: string;
  scheduledDate: string;
  estimatedMinutes: number;
  logicalTaskId?: string;
}>) => tasks.map((task) => ({
  task_description: task.taskDescription,
  scheduled_date: task.scheduledDate,
  estimated_minutes: task.estimatedMinutes,
  logical_task_id: task.logicalTaskId,
}));

const main = async () => {
  if (!config.geminiApiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is required for the real-model agent canary.'), { code: 'GEMINI_KEY_REQUIRED' });
  }

  const today = todayInTimezone('UTC');
  const selection = resolveCanarySelection(evaluationDataset, process.env);
  const hardCostMicroUsd = budget.toMicroUsd(Number.parseFloat(process.env.AGENT_EVAL_MAX_COST_USD || '2'));
  const usage = { modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostMicroUsd: 0 };
  let costLimitReached = false;
  const createGateway = (modelName: string) => new GeminiModelGateway({
    apiKey: config.geminiApiKey, modelName,
    maxOutputTokens: config.aiMaxOutputTokens, thinkingBudget: config.aiThinkingBudget,
    onUsage: async ({ usage: callUsage }) => {
      const estimated = budget.estimateCostMicroUsd({
        model: modelName,
        promptTokens: callUsage.inputTokens,
        outputTokens: callUsage.outputTokens,
      });
      usage.modelCalls += 1;
      usage.inputTokens += callUsage.inputTokens;
      usage.outputTokens += callUsage.outputTokens;
      usage.totalTokens += callUsage.totalTokens;
      usage.estimatedCostMicroUsd += estimated.estimatedTotalMicroUsd;
      if (usage.estimatedCostMicroUsd > hardCostMicroUsd) {
        costLimitReached = true;
        throw Object.assign(new Error('The agent evaluation cost ceiling was exceeded.'), { code: 'EVAL_COST_LIMIT' });
      }
    },
  });
  const routerGateway = createGateway(config.geminiRouterModel);
  const agentGateway = createGateway(config.geminiAgentModel);

  const outcomes: EvaluationOutcome[] = [];
  const failureCounts: Record<string, number> = {};
  const recoveredFailureCounts: Record<string, number> = {};
  const failures: Array<{
    id: string; stage: string; code: string; issueCodes: string[]; recovered: boolean; errorType: string; statusCode: number | null;
  }> = [];
  for (const [caseIndex, item] of selection.cases.entries()) {
    if (costLimitReached) break;
    const dueDate = addDays(today, Math.max(0, item.horizonDays));
    const assignment = ['publish_initial_plan', 'repair_plan'].includes(item.expectedIntent) ? {
      id: 1,
      title: `${item.subject} assignment`,
      description: item.assignmentDescription || (item.adversarial ? item.request : ''),
      complexity: item.complexity,
      dueDate,
      totalItems: item.totalItems,
    } : null;
    const base = createInitialGraphState({
      runId: crypto.randomUUID(), actorUserId: 1, assignmentId: assignment?.id ?? null,
      runType: item.expectedIntent === 'repair_plan'
        ? 'repair'
        : item.expectedIntent === 'publish_initial_plan'
          ? 'initial_plan'
          : 'conversation',
      triggerType: item.expectedIntent === 'publish_initial_plan' ? 'assignment_form' : 'user_message',
      userRequest: item.request,
    });
    const state = {
      ...base,
      assignment,
      planningProfile: {
        timezone: 'UTC', weekdayAvailableMinutes: { 0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 },
        maxDailyMinutes: 120, preferredSessionMinutes: 45, version: 1,
      },
      planningDate: today,
      existingPlanVersionId: item.expectedIntent === 'repair_plan' ? crypto.randomUUID() : null,
      existingPlan: item.expectedIntent === 'repair_plan' ? [{
        logicalTaskId: crypto.randomUUID(), taskDescription: 'Finish existing work',
        scheduledDate: today, estimatedMinutes: 30,
      }] : [],
    };
    let stage = 'coordinator';
    const recordFailure = (error: unknown, recovered: boolean) => {
      const failureCode = classifyEvaluationFailure(error);
      const counts = recovered ? recoveredFailureCounts : failureCounts;
      counts[failureCode] = (counts[failureCode] || 0) + 1;
      failures.push({
        id: item.id, stage, code: failureCode,
        issueCodes: evaluationFailureIssueCodes(error), recovered,
        errorType: error instanceof Error ? error.name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) : 'UnknownError',
        statusCode: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : null,
      });
    };
    const paced = async <T>(operation: () => Promise<T>): Promise<T> => {
      const result = await operation();
      await waitForCanaryPacing(selection.delayMs);
      return result;
    };
    const isTransientModelFailure = (error: unknown) => [
      'MODEL_PROVIDER_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'MODEL_QUOTA_EXCEEDED', 'MODEL_TIMEOUT',
    ].includes(classifyEvaluationFailure(error));
    const transientBackoff = async (error: unknown, attempt: number) => {
      const code = classifyEvaluationFailure(error);
      const base = code === 'MODEL_QUOTA_EXCEEDED' || code === 'MODEL_UNAVAILABLE' ? 15_000 : 5_000;
      await waitForCanaryPacing(Math.max(selection.delayMs, base * attempt));
    };
    const withRuntimeRetries = async <T>(operation: () => Promise<T>): Promise<T> => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await paced(operation);
        } catch (error) {
          if (!isTransientModelFailure(error) || attempt === 3) throw error;
          recordFailure(error, true);
          await transientBackoff(error, attempt);
        }
      }
      throw Object.assign(new Error('Model retries were exhausted.'), { code: 'MODEL_PROVIDER_UNAVAILABLE' });
    };
    const coordinateWithRuntimeRetries = async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const attemptSpecialists = createSpecialists(routerGateway, {
          gatewayForRole: (role) => role === 'coordinator' || role === 'reviewer' ? routerGateway : agentGateway,
          maxModelCalls: 5, maxToolCalls: 12,
        });
        if (state.triggerType === 'assignment_form') {
          return {
            intent: {
              intent: 'publish_initial_plan' as const, assignmentId: state.assignmentId,
              missingFields: [], responseMode: 'plan' as const,
            },
            specialists: attemptSpecialists,
          };
        }
        if (state.runType === 'repair') {
          return {
            intent: {
              intent: 'repair_plan' as const, assignmentId: state.assignmentId,
              missingFields: [], responseMode: 'plan' as const,
            },
            specialists: attemptSpecialists,
          };
        }
        try {
          const intent = await paced(() => attemptSpecialists.coordinate(state));
          return { intent, specialists: attemptSpecialists };
        } catch (error) {
          if (!isTransientModelFailure(error) || attempt === 3) throw error;
          recordFailure(error, true);
          await transientBackoff(error, attempt);
        }
      }
      throw Object.assign(new Error('Coordinator retries were exhausted.'), { code: 'MODEL_PROVIDER_UNAVAILABLE' });
    };
    try {
      const { intent, specialists } = await coordinateWithRuntimeRetries();
      const schemaValid = true;
      let invariantViolations: string[] = [];
      let semanticPass = intent.intent === item.expectedIntent;
      if (intent.intent === 'publish_initial_plan' && assignment) {
        let draft: PlanDraft | null = null;
        let usingFallback = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          stage = 'planner';
          try {
            draft = await paced(() => specialists.createPlan({
              ...state, intent, candidatePlan: draft,
              deterministicIssues: invariantViolations,
            }));
          } catch (error) {
            recordFailure(error, true);
            draft = fallbackDraft({ ...state, intent });
            usingFallback = true;
          }
          stage = 'validation';
          invariantViolations = validatePlan({
            tasks: tasksForValidation(draft.tasks), assignment, profile: state.planningProfile,
            existingLoad: {}, today: today,
          });
          if (invariantViolations.length || usingFallback) {
            if (!invariantViolations.length) break;
            if (attempt === 0 && !usingFallback) continue;
            draft = fallbackDraft({ ...state, intent });
            usingFallback = true;
            invariantViolations = validatePlan({
              tasks: tasksForValidation(draft.tasks), assignment, profile: state.planningProfile,
              existingLoad: {}, today: today,
            });
            break;
          }
          stage = 'reviewer';
          try {
            const review = await paced(() => specialists.reviewPlan({ ...state, intent, candidatePlan: draft }));
            if (review.accept) break;
            if (attempt === 0) continue;
            draft = fallbackDraft({ ...state, intent });
            usingFallback = true;
          } catch (error) {
            recordFailure(error, true);
            break;
          }
        }
        if (!draft) throw Object.assign(new Error('No plan draft was produced.'), { code: 'MODEL_STRUCTURE_INVALID' });
        stage = 'validation';
        invariantViolations = validatePlan({
          tasks: tasksForValidation(draft.tasks), assignment, profile: state.planningProfile,
          existingLoad: {}, today: today,
        });
        const draftText = draft.tasks.map((task) => task.taskDescription).join(' ').toLowerCase();
        semanticPass = semanticPass
          && draft.tasks.every((task) => task.taskDescription.trim().length >= 3)
          && (item.requiredTopics || []).every((topic) => draftText.includes(topic.toLowerCase()))
          && (item.forbiddenTerms || []).every((term) => !draftText.includes(term.toLowerCase()));
      } else if (intent.intent === 'repair_plan' && assignment) {
        let draft: PlanDraft;
        stage = 'repair';
        try {
          draft = await paced(() => specialists.repairPlan({ ...state, intent }));
        } catch (error) {
          recordFailure(error, true);
          draft = fallbackDraft({ ...state, intent });
        }
        stage = 'validation';
        invariantViolations = validatePlan({
          tasks: tasksForValidation(draft.tasks), assignment, profile: state.planningProfile, existingLoad: {},
          existingPlan: state.existingPlan, completedLogicalTaskIds: [],
        });
        if (invariantViolations.length > 0) {
          draft = fallbackDraft({ ...state, intent, deterministicIssues: invariantViolations });
          invariantViolations = validatePlan({
            tasks: tasksForValidation(draft.tasks), assignment, profile: state.planningProfile, existingLoad: {},
            existingPlan: state.existingPlan, completedLogicalTaskIds: [],
          });
        }
        semanticPass = semanticPass && draft.tasks.length > 0;
      } else if (intent.intent === 'schedule_query') {
        stage = 'schedule';
        const response = buildScheduleResponse({ ...state, intent });
        const normalized = response.answer.toLowerCase();
        semanticPass = semanticPass
          && (item.expectedResponseTerms || []).every((term) => normalized.includes(term.toLowerCase()));
      } else if (intent.intent !== 'clarify') {
        stage = 'tutor';
        const response = await withRuntimeRetries(() => specialists.tutor({ ...state, intent }));
        const normalized = response.answer.toLowerCase();
        semanticPass = semanticPass
          && intent.missingFields.length === 0
          && response.answer.trim().length >= 40
          && (item.expectedResponseTerms || []).every((term) => normalized.includes(term.toLowerCase()))
          && !/\b(totalitems|duedate|complexity)\b/i.test(response.answer);
      } else {
        semanticPass = semanticPass && intent.missingFields.length > 0 && Boolean(intent.clarificationQuestion);
      }
      outcomes.push({
        id: item.id, actualIntent: intent.intent, schemaValid,
        invariantViolations, approvalBypassed: false, duplicatePublishes: 0, semanticPass,
      });
    } catch (error) {
      const failureCode = classifyEvaluationFailure(error);
      recordFailure(error, false);
      outcomes.push({
        id: item.id, actualIntent: 'error', schemaValid: false,
        invariantViolations: [failureCode], approvalBypassed: false,
        duplicatePublishes: 0, semanticPass: false,
      });
    }
    if (caseIndex < selection.cases.length - 1 && !costLimitReached && selection.delayMs === 0) {
      await waitForCanaryPacing(selection.delayMs);
    }
  }

  const report = evaluateOutcomes(selection.cases, outcomes);
  const intentMismatches = outcomes
    .map((outcome) => {
      const expected = selection.cases.find((item) => item.id === outcome.id)?.expectedIntent;
      return expected && expected !== outcome.actualIntent
        ? { id: outcome.id, expected, actual: outcome.actualIntent }
        : null;
    })
    .filter(Boolean);
  const invariantFailures = outcomes
    .filter((outcome) => outcome.invariantViolations.length > 0)
    .map((outcome) => ({ id: outcome.id, codes: outcome.invariantViolations }));
  process.stdout.write(`${JSON.stringify({
    report, usage, costLimitReached, failureCounts, recoveredFailureCounts, failures,
    intentMismatches, invariantFailures,
  }, null, 2)}\n`);
  if (selection.isCompleteReleaseRun) assertReleaseGates(report);
};

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
