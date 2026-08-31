import { describe, expect, it } from 'vitest';
import {
  AgentRunSchema,
  ApprovalDecisionSchema,
  CreateAssignmentRequestSchema,
  PlanDraftSchema,
} from './contracts.js';

describe('shared contracts', () => {
  it('accepts a bounded typed plan draft', () => {
    expect(PlanDraftSchema.parse({
      tasks: [{
        taskDescription: 'Review chapter examples',
        scheduledDate: '2099-06-01',
        estimatedMinutes: 45,
      }],
      rationale: 'Start with review before practice.',
    }).assumptions).toEqual([]);
  });

  it('rejects malformed assignment and approval inputs', () => {
    expect(CreateAssignmentRequestSchema.safeParse({
      title: 'x', complexity: 'Impossible', dueDate: 'tomorrow', totalItems: 0,
    }).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({
      decision: 'approve', proposalHash: 'stale',
    }).success).toBe(false);
  });

  it('uses the generic public run lifecycle', () => {
    const parsed = AgentRunSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      threadId: null,
      assignmentId: 1,
      status: 'waiting_for_approval',
      currentStep: 'approval',
      runType: 'schedule_repair',
      triggerType: 'schedule_health',
      attemptNumber: 0,
      retryOfRunId: null,
      planSource: 'agentic',
      failureCode: null,
      failureMessage: null,
      graphVersion: 'disciplan-v1',
      promptBundleVersion: '2026-08-25',
      modelProvider: 'google',
      modelName: 'gemini',
      createdAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });
});
