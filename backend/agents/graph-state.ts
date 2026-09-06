import { Annotation } from '@langchain/langgraph';
import type { PlanDraft, PlanTaskInput } from '../../shared/contracts.js';

const { GRAPH_VERSION, PROMPT_BUNDLE_VERSION } = require('./runtime-registry.js') as {
  GRAPH_VERSION: string;
  PROMPT_BUNDLE_VERSION: string;
};

export type ConversationMessage = { id: string; role: 'user' | 'assistant'; content: string };
export type CollectedContext = {
  title?: string;
  description?: string;
  complexity?: 'Easy' | 'Medium' | 'Hard';
  dueDate?: string;
  totalItems?: number;
  topic?: string;
  learningGoal?: string;
  sourceMessageIds?: string[];
};

export type AssistantDecision = {
  intent: 'tutor' | 'answer' | 'draft_plan' | 'publish_initial_plan' | 'repair_plan' | 'break_down_task' | 'schedule_query' | 'clarify';
  assignmentId: number | null;
  missingFields: string[];
  responseMode: 'plan' | 'answer' | 'question';
  contextDelta?: Omit<CollectedContext, 'sourceMessageIds'>;
  normalizedAssignment?: Partial<Omit<AssignmentSnapshot, 'id'>>;
  clarificationQuestion?: string;
  answer?: string;
  preferenceProposal?: { key: string; value: string };
  useGroundedResources?: boolean;
};
export type IntentEnvelope = AssistantDecision;

export type ReviewResult = {
  accept: boolean;
  issues: Array<{ code: string; instruction: string }>;
};

export type AssistantCitation = { title: string; url: string };
export type AssistantResponse = {
  kind: 'answer' | 'tutor' | 'clarification' | 'plan' | 'proposal' | 'failure';
  answer: string;
  studyTips: string[];
  suggestedActions: Array<{ label: string; prompt: string }>;
  citations: AssistantCitation[];
};

export type ApprovalDecision = {
  decision: 'approve' | 'reject';
  proposalHash: string;
};

export type AssignmentSnapshot = {
  id: number;
  title: string;
  description: string;
  complexity: 'Easy' | 'Medium' | 'Hard';
  dueDate: string;
  totalItems: number;
};

export type PlanningProfileSnapshot = {
  timezone: string;
  weekdayAvailableMinutes: Record<number, number>;
  maxDailyMinutes: number;
  preferredSessionMinutes: number;
  version: number;
};

export const DisciplanGraphState = Annotation.Root({
  runId: Annotation<string>,
  threadId: Annotation<string | null>,
  actorUserId: Annotation<number>,
  assignmentId: Annotation<number | null>,
  runType: Annotation<'initial_plan' | 'conversation' | 'repair' | 'health_scan'>,
  triggerType: Annotation<'assignment_form' | 'user_message' | 'user_request' | 'schedule_health'>,
  graphVersion: Annotation<string>,
  promptBundleVersion: Annotation<string>,
  userRequest: Annotation<string>,
  originalGoal: Annotation<string>,
  latestUserMessage: Annotation<string>,
  conversationMessages: Annotation<ConversationMessage[]>,
  collectedContext: Annotation<CollectedContext>,
  activeTutorTopic: Annotation<string | null>,
  pendingClarification: Annotation<{ question: string; missingFields: string[] } | null>,
  assistantResponse: Annotation<AssistantResponse | null>,
  conversationSummary: Annotation<string>,
  confirmedMemories: Annotation<Record<string, string>>,
  availableAssignments: Annotation<Array<{ id: number; title: string; description: string; dueDate: string; complexity: string }>>,
  availableTasks: Annotation<Array<{ id: number; assignmentId: number; description: string; scheduledDate: string; completed: boolean }>>,
  intent: Annotation<IntentEnvelope | null>,
  assignment: Annotation<AssignmentSnapshot | null>,
  planningProfile: Annotation<PlanningProfileSnapshot | null>,
  planningDate: Annotation<string | null>,
  existingLoad: Annotation<Record<string, number>>,
  existingPlanVersionId: Annotation<string | null>,
  existingPlan: Annotation<PlanTaskInput[]>,
  completedLogicalTaskIds: Annotation<string[]>,
  candidatePlan: Annotation<PlanDraft | null>,
  planVersionId: Annotation<string | null>,
  proposalHash: Annotation<string | null>,
  deterministicIssues: Annotation<string[]>,
  detectedConflicts: Annotation<string[]>,
  semanticReview: Annotation<ReviewResult | null>,
  approvalId: Annotation<string | null>,
  approvalDecision: Annotation<ApprovalDecision | null>,
  revisionCount: Annotation<number>,
  modelCallCount: Annotation<number>,
  toolCallCount: Annotation<number>,
  usingFallback: Annotation<boolean>,
  cancelled: Annotation<boolean>,
  shadowMode: Annotation<boolean>,
  finalResponse: Annotation<string | null>,
  failureCode: Annotation<string | null>,
});

export type DisciplanState = typeof DisciplanGraphState.State;
export type DisciplanStateUpdate = typeof DisciplanGraphState.Update;

export const createInitialGraphState = (input: Pick<DisciplanState,
  'runId' | 'actorUserId' | 'runType' | 'triggerType' | 'userRequest'
> & Partial<DisciplanState>): DisciplanState => ({
  runId: input.runId,
  threadId: input.threadId ?? null,
  actorUserId: input.actorUserId,
  assignmentId: input.assignmentId ?? null,
  runType: input.runType,
  triggerType: input.triggerType,
  graphVersion: input.graphVersion ?? GRAPH_VERSION,
  promptBundleVersion: input.promptBundleVersion ?? PROMPT_BUNDLE_VERSION,
  userRequest: input.userRequest,
  originalGoal: input.originalGoal ?? input.userRequest,
  latestUserMessage: input.latestUserMessage ?? input.userRequest,
  conversationMessages: input.conversationMessages ?? [],
  collectedContext: input.collectedContext ?? {},
  activeTutorTopic: input.activeTutorTopic ?? null,
  pendingClarification: input.pendingClarification ?? null,
  assistantResponse: input.assistantResponse ?? null,
  conversationSummary: input.conversationSummary ?? '',
  confirmedMemories: input.confirmedMemories ?? {},
  availableAssignments: input.availableAssignments ?? [],
  availableTasks: input.availableTasks ?? [],
  intent: input.intent ?? null,
  assignment: input.assignment ?? null,
  planningProfile: input.planningProfile ?? null,
  planningDate: input.planningDate ?? null,
  existingLoad: input.existingLoad ?? {},
  existingPlanVersionId: input.existingPlanVersionId ?? null,
  existingPlan: input.existingPlan ?? [],
  completedLogicalTaskIds: input.completedLogicalTaskIds ?? [],
  candidatePlan: input.candidatePlan ?? null,
  planVersionId: input.planVersionId ?? null,
  proposalHash: input.proposalHash ?? null,
  deterministicIssues: input.deterministicIssues ?? [],
  detectedConflicts: input.detectedConflicts ?? [],
  semanticReview: input.semanticReview ?? null,
  approvalId: input.approvalId ?? null,
  approvalDecision: input.approvalDecision ?? null,
  revisionCount: input.revisionCount ?? 0,
  modelCallCount: input.modelCallCount ?? 0,
  toolCallCount: input.toolCallCount ?? 0,
  usingFallback: input.usingFallback ?? false,
  cancelled: input.cancelled ?? false,
  shadowMode: input.shadowMode ?? false,
  finalResponse: input.finalResponse ?? null,
  failureCode: input.failureCode ?? null,
});
