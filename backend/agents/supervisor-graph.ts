import { END, START, StateGraph, interrupt, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { PlanDraft } from '../../shared/contracts.js';
import {
  DisciplanGraphState,
  type ApprovalDecision,
  type DisciplanState,
  type DisciplanStateUpdate,
  type IntentEnvelope,
  type ReviewResult,
} from './graph-state.js';

export type SupervisorDependencies = {
  loadContext: (state: DisciplanState) => Promise<DisciplanStateUpdate>;
  coordinate: (state: DisciplanState) => Promise<IntentEnvelope>;
  materializeAssignment: (state: DisciplanState) => Promise<DisciplanStateUpdate>;
  createPlan: (state: DisciplanState) => Promise<{ draft: PlanDraft; usingFallback: boolean }>;
  repairPlan: (state: DisciplanState) => Promise<{ draft: PlanDraft; usingFallback: boolean }>;
  reviewPlan: (state: DisciplanState) => Promise<ReviewResult>;
  validatePlan: (state: DisciplanState) => Promise<string[]> | string[];
  fallbackPlan: (state: DisciplanState) => Promise<PlanDraft> | PlanDraft;
  saveDraft: (state: DisciplanState) => Promise<{ planVersionId: string; proposalHash: string }>;
  publishInitial: (state: DisciplanState) => Promise<void>;
  publishRepair: (state: DisciplanState) => Promise<void>;
  createApproval: (state: DisciplanState) => Promise<{ approvalId: string; proposalHash: string }>;
  answer: (state: DisciplanState) => Promise<string> | string;
};

const ensureActive = (state: DisciplanState) => {
  if (state.cancelled) throw Object.assign(new Error('Agent run was cancelled.'), { code: 'RUN_CANCELLED' });
};

export const createSupervisorGraph = (
  dependencies: SupervisorDependencies,
  options: { checkpointer?: BaseCheckpointSaver | false } = {},
) => {
  const graph = new StateGraph(DisciplanGraphState)
    .addNode('context', async (state) => {
      ensureActive(state);
      return dependencies.loadContext(state);
    })
    .addNode('coordinate', async (state) => {
      ensureActive(state);
      const intent = await dependencies.coordinate(state);
      const sourceMessageIds = state.conversationMessages.filter((message) => message.role === 'user').map((message) => message.id);
      return {
        intent,
        collectedContext: {
          ...state.collectedContext,
          ...(intent.contextDelta ?? {}),
          sourceMessageIds: [...new Set([...(state.collectedContext.sourceMessageIds ?? []), ...sourceMessageIds])].slice(-50),
        },
        pendingClarification: intent.intent === 'clarify'
          ? { question: intent.clarificationQuestion || 'What detail would help me continue?', missingFields: intent.missingFields }
          : null,
        modelCallCount: state.modelCallCount + 1,
      };
    })
    .addNode('clarify', (state) => {
      const response = interrupt({
        type: 'clarification',
        missingFields: state.intent?.missingFields ?? [],
        question: state.intent?.clarificationQuestion || 'What detail would help me continue?',
      }) as { response: string };
      return {
        latestUserMessage: response.response,
        conversationMessages: [...state.conversationMessages, {
          id: `resume-${state.runId}-${state.conversationMessages.length}`,
          role: 'user' as const,
          content: response.response,
        }],
        intent: null,
        pendingClarification: null,
      };
    })
    .addNode('materializeAssignment', async (state) => {
      ensureActive(state);
      return dependencies.materializeAssignment(state);
    })
    .addNode('plan', async (state) => {
      ensureActive(state);
      const result = await dependencies.createPlan(state);
      return {
        candidatePlan: result.draft,
        deterministicIssues: [],
        semanticReview: null,
        revisionCount: state.candidatePlan ? state.revisionCount + 1 : state.revisionCount,
        modelCallCount: state.modelCallCount + 1,
        usingFallback: result.usingFallback,
      };
    })
    .addNode('repair', async (state) => {
      ensureActive(state);
      const result = await dependencies.repairPlan(state);
      return {
        candidatePlan: result.draft,
        deterministicIssues: [],
        semanticReview: null,
        revisionCount: state.candidatePlan ? state.revisionCount + 1 : state.revisionCount,
        modelCallCount: state.modelCallCount + 1,
        usingFallback: result.usingFallback,
      };
    })
    .addNode('validate', async (state) => ({ deterministicIssues: await dependencies.validatePlan(state) }))
    .addNode('review', async (state) => {
      ensureActive(state);
      return { semanticReview: await dependencies.reviewPlan(state), modelCallCount: state.modelCallCount + 1 };
    })
    .addNode('fallback', async (state) => ({
      candidatePlan: await dependencies.fallbackPlan(state),
      deterministicIssues: [],
      semanticReview: null,
      usingFallback: true,
    }))
    .addNode('saveDraft', async (state) => dependencies.saveDraft(state))
    .addNode('publishInitial', async (state) => {
      ensureActive(state);
      await dependencies.publishInitial(state);
      return { finalResponse: await dependencies.answer(state) };
    })
    .addNode('createApproval', async (state) => dependencies.createApproval(state))
    .addNode('approval', (state) => {
      const decision = interrupt({
        type: 'approval',
        approvalId: state.approvalId,
        proposalHash: state.proposalHash,
      }) as ApprovalDecision;
      return { approvalDecision: decision };
    })
    .addNode('publishRepair', async (state) => {
      ensureActive(state);
      if (state.approvalDecision?.decision !== 'approve' || state.approvalDecision.proposalHash !== state.proposalHash) {
        return { failureCode: 'APPROVAL_MISMATCH', finalResponse: 'The proposed plan was not applied.' };
      }
      await dependencies.publishRepair(state);
      return { finalResponse: await dependencies.answer(state) };
    })
    .addNode('respond', async (state) => ({ finalResponse: await dependencies.answer(state) }))
    .addNode('fail', () => ({
      failureCode: 'VALIDATION_FAILED',
      finalResponse: 'No plan could satisfy the current scheduling constraints.',
    }))
    .addEdge(START, 'context')
    .addEdge('context', 'coordinate')
    .addConditionalEdges('coordinate', (state) => {
      if (!state.intent || state.intent.intent === 'clarify' || state.intent.missingFields.length) return 'clarify';
      if (state.intent.intent === 'publish_initial_plan') return state.assignment ? 'plan' : 'materializeAssignment';
      if (state.intent.intent === 'repair_plan') return 'repair';
      return 'respond';
    }, ['clarify', 'materializeAssignment', 'plan', 'repair', 'respond'])
    .addEdge('clarify', 'context')
    .addEdge('materializeAssignment', 'plan')
    .addEdge('plan', 'validate')
    .addEdge('repair', 'validate')
    .addConditionalEdges('validate', (state) => {
      if (state.deterministicIssues.length === 0) return state.usingFallback ? 'saveDraft' : 'review';
      if (state.usingFallback) return 'fail';
      if (state.revisionCount < 1) return state.runType === 'repair' ? 'repair' : 'plan';
      return 'fallback';
    }, ['review', 'saveDraft', 'plan', 'repair', 'fallback', 'fail'])
    .addConditionalEdges('review', (state) => {
      if (state.semanticReview?.accept) return 'saveDraft';
      if (state.revisionCount < 1) return state.runType === 'repair' ? 'repair' : 'plan';
      return 'fallback';
    }, ['saveDraft', 'plan', 'repair', 'fallback'])
    .addEdge('fallback', 'validate')
    .addConditionalEdges('saveDraft', (state) => (
      state.shadowMode
        ? 'respond'
        : state.intent?.intent === 'publish_initial_plan' && !state.existingPlanVersionId
        ? 'publishInitial'
        : 'createApproval'
    ), ['respond', 'publishInitial', 'createApproval'])
    .addEdge('createApproval', 'approval')
    .addConditionalEdges('approval', (state) => state.approvalDecision?.decision === 'approve' ? 'publishRepair' : 'respond', ['publishRepair', 'respond'])
    .addEdge('publishInitial', END)
    .addEdge('publishRepair', END)
    .addEdge('respond', END)
    .addEdge('fail', END);

  return graph.compile({ checkpointer: options.checkpointer });
};
