import { z } from 'zod';

export const ComplexitySchema = z.enum(['Easy', 'Medium', 'Hard']);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PositiveIdSchema = z.number().int().positive();
export const UuidSchema = z.string().uuid();

export const PlanSourceSchema = z.enum([
  'gemini',
  'fallback_error',
  'fallback_limit',
  'agentic',
]);
export type PlanSource = z.infer<typeof PlanSourceSchema>;

export const AgentRunStatusSchema = z.enum([
  'accepted',
  'queued',
  'running',
  'waiting_for_input',
  'waiting_for_approval',
  'succeeded',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type RunStatus = AgentRunStatus;

export const PlanTaskInputSchema = z.object({
  logicalTaskId: UuidSchema.optional(),
  taskDescription: z.string().trim().min(3).max(500),
  scheduledDate: DateOnlySchema,
  estimatedMinutes: z.number().int().min(1).max(720),
  workloadUnits: z.number().min(0.01).max(1_000).optional(),
  kind: z.string().trim().min(1).max(50).optional(),
});
export type PlanTaskInput = z.infer<typeof PlanTaskInputSchema>;

export const PlanDraftSchema = z.object({
  tasks: z.array(PlanTaskInputSchema).min(1).max(120),
  rationale: z.string().trim().min(1).max(2_000),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

export const StudyTaskSchema = z.object({
  id: PositiveIdSchema,
  assignment_id: PositiveIdSchema,
  task_description: z.string(),
  scheduled_date: DateOnlySchema,
  completed: z.boolean(),
  estimated_minutes: z.number().int().nullable(),
  completed_at: z.string().nullable().optional(),
  logical_task_id: UuidSchema.nullable().optional(),
  plan_version_id: UuidSchema.nullable().optional(),
});
export type StudyTask = z.infer<typeof StudyTaskSchema>;

export const AgentRunSchema = z.object({
  id: UuidSchema,
  threadId: UuidSchema.nullable(),
  assignmentId: PositiveIdSchema.nullable(),
  status: AgentRunStatusSchema,
  currentStep: z.string().nullable(),
  runType: z.enum(['initial_plan', 'conversation', 'repair', 'health_scan']),
  triggerType: z.enum(['assignment_form', 'user_message', 'user_request', 'schedule_health']),
  attemptNumber: z.number().int().nonnegative(),
  retryOfRunId: UuidSchema.nullable(),
  planSource: PlanSourceSchema.nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  graphVersion: z.string(),
  promptBundleVersion: z.string(),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export interface PlanGenerationRun {
  id: string;
  assignment_id: number;
  user_id: number;
  status: string;
  current_step: string | null;
  attempt_count: number;
  plan_source: PlanSource | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export const CreateAssignmentRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(2_000).optional(),
  complexity: ComplexitySchema,
  dueDate: DateOnlySchema,
  totalItems: z.number().int().min(1).max(1_000),
});
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequestSchema>;

export interface CreateAssignmentResponse {
  message: 'Assignment accepted';
  id: number;
  assignment: Record<string, unknown>;
  run: PlanGenerationRun | AgentRun;
  queued?: boolean;
  duplicate?: boolean;
}

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
