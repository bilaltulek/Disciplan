import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createInitialGraphState } from './graph-state.js';
import {
  createReadTools, IntentEnvelopeSchema, ModelInitialPlanDraftSchema, ModelRepairPlanDraftSchema,
  ReviewResultSchema,
} from './specialists.js';

describe('specialist tool allowlists', () => {
  const state = createInitialGraphState({
    runId: 'fb1fbe14-44b3-4e48-bdef-f49d25b76d90', actorUserId: 42,
    assignmentId: 9, runType: 'repair', triggerType: 'user_request', userRequest: 'Move missed work.',
    existingPlan: [{
      logicalTaskId: 'a62c92df-1a03-4c77-8347-bcfeae13311e',
      taskDescription: 'Draft introduction', scheduledDate: '2099-01-02', estimatedMinutes: 30,
    }],
    completedLogicalTaskIds: ['a62c92df-1a03-4c77-8347-bcfeae13311e'],
    existingLoad: { '2099-01-03': 45 },
    detectedConflicts: ['MISSED_TASK:1'],
    planningProfile: {
      timezone: 'UTC', weekdayAvailableMinutes: { 1: 60 }, maxDailyMinutes: 60,
      preferredSessionMinutes: 30, version: 1,
    },
    assignment: {
      id: 9, title: 'Essay', description: '', complexity: 'Medium', dueDate: '2099-01-10', totalItems: 4,
    },
  });

  it('exposes published-plan and schedule reads only to the repair specialist', async () => {
    const audit = vi.fn();
    const budget = { modelCallsRemaining: 5, toolCallsRemaining: 12 };
    const repairTools = createReadTools({
      role: 'repair', state, signal: new AbortController().signal, budget, audit,
    });
    expect(repairTools.map((item) => item.name).sort()).toEqual(['get_published_plan', 'get_schedule_context']);
    const plan = await repairTools.find((item) => item.name === 'get_published_plan')!.invoke({});
    expect(plan).toEqual({ tasks: state.existingPlan, completedLogicalTaskIds: state.completedLogicalTaskIds });
    expect(budget.toolCallsRemaining).toBe(11);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      runId: state.runId, toolName: 'get_published_plan', resultCode: 'OK', resourceIds: { assignmentId: 9 },
    }));

    const coordinatorTools = createReadTools({
      role: 'coordinator', state, signal: new AbortController().signal,
      budget: { modelCallsRemaining: 5, toolCallsRemaining: 12 }, audit,
    });
    expect(coordinatorTools).toEqual([]);

    const plannerTools = createReadTools({
      role: 'planner', state, signal: new AbortController().signal,
      budget: { modelCallsRemaining: 5, toolCallsRemaining: 12 }, audit,
    });
    expect(plannerTools).toEqual([]);
  });

  it('keeps every model-facing schema within Gemini function-schema keywords', () => {
    const schemas = [
      IntentEnvelopeSchema, ModelInitialPlanDraftSchema, ModelRepairPlanDraftSchema, ReviewResultSchema,
    ]
      .map((schema) => JSON.stringify(z.toJSONSchema(schema)));

    for (const schema of schemas) {
      expect(schema).not.toContain('exclusiveMinimum');
      expect(schema).not.toContain('exclusiveMaximum');
      expect(schema).not.toContain('"default"');
      expect(schema).not.toContain('"format"');
    }
  });

  it('does not let an initial-plan model invent persistence identity', () => {
    const parsed = ModelInitialPlanDraftSchema.parse({
      tasks: [{
        logicalTaskId: 'model-invented-id', taskDescription: 'Outline',
        scheduledDate: '2099-01-01', estimatedMinutes: 30,
      }],
      rationale: 'Start with an outline.', assumptions: [],
    });
    expect(parsed.tasks[0]).not.toHaveProperty('logicalTaskId');
  });

  it('allows tutoring without assignment-form fields and accepts incremental context', () => {
    expect(IntentEnvelopeSchema.parse({
      intent: 'tutor', assignmentId: null, missingFields: [], responseMode: 'answer',
      contextDelta: { topic: 'C pointers', learningGoal: 'Understand pointer arithmetic' },
      answer: 'Let us start with what a pointer stores.',
    })).toMatchObject({ intent: 'tutor', missingFields: [] });

    expect(IntentEnvelopeSchema.parse({
      intent: 'clarify', assignmentId: null, missingFields: ['schedule deadline'], responseMode: 'question',
      clarificationQuestion: 'I understand that you want this scheduled. When would you like to finish it?',
      contextDelta: { title: 'Operating systems review', complexity: 'Medium' },
    }).contextDelta?.title).toBe('Operating systems review');
  });
});
