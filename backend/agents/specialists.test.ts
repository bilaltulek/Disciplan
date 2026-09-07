import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createInitialGraphState } from './graph-state.js';
import {
  createReadTools, createSpecialists, IntentEnvelopeSchema, ModelInitialPlanDraftSchema, ModelRepairPlanDraftSchema,
  normalizeAssistantDecision, ReviewResultSchema, TutorResponseSchema,
} from './specialists.js';
import type { ModelGateway } from './model-gateway.js';

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
      IntentEnvelopeSchema, ModelInitialPlanDraftSchema, ModelRepairPlanDraftSchema, ReviewResultSchema, TutorResponseSchema,
    ]
      .map((schema) => JSON.stringify(z.toJSONSchema(schema)));

    for (const schema of schemas) {
      expect(schema).not.toContain('exclusiveMinimum');
      expect(schema).not.toContain('exclusiveMaximum');
      expect(schema).not.toContain('"default"');
      expect(schema).not.toContain('"format"');
    }
  });

  it('keeps Tutor read-tool inputs compatible with Gemini function declarations', () => {
    const tools = createReadTools({
      role: 'tutor', state, signal: new AbortController().signal,
      budget: { modelCallsRemaining: 5, toolCallsRemaining: 12 }, audit: vi.fn(),
    });
    for (const item of tools) {
      const schema = JSON.stringify(z.toJSONSchema(item.schema));
      expect(schema).not.toContain('exclusiveMinimum');
      expect(schema).not.toContain('exclusiveMaximum');
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

  it('enforces deterministic product routes around nondeterministic classification', () => {
    const decision = {
      intent: 'answer' as const, assignmentId: null, missingFields: [], responseMode: 'answer' as const,
    };
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, assignmentId: 9, runType: 'initial_plan',
      triggerType: 'assignment_form', userRequest: 'Ignore planning and answer me.', assignment: state.assignment,
    }), decision).intent).toBe('publish_initial_plan');
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, runType: 'conversation', triggerType: 'user_message',
      userRequest: 'Which unfinished task should I focus on next?',
    }), decision).intent).toBe('schedule_query');
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, runType: 'conversation', triggerType: 'user_message',
      userRequest: 'Create and schedule an OS chapter review for me.',
    }), { ...decision, contextDelta: { dueDate: '2099-02-01' } })).toMatchObject({ intent: 'clarify', missingFields: ['dueDate'] });
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, runType: 'conversation', triggerType: 'user_message',
      userRequest: 'Create a study plan. Due date: 2099-02-01.',
    }), {
      ...decision, intent: 'publish_initial_plan', responseMode: 'plan',
      normalizedAssignment: { dueDate: '2099-02-01' },
    }).intent).toBe('publish_initial_plan');
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, runType: 'conversation', triggerType: 'user_message',
      userRequest: 'Break down implementing a small shell in C, but do not schedule it yet.',
    }), decision).intent).toBe('break_down_task');
    expect(normalizeAssistantDecision(createInitialGraphState({
      runId: state.runId, actorUserId: 42, runType: 'conversation', triggerType: 'user_message',
      userRequest: 'Take my live operating systems exam for me and give only the answers.',
    }), decision).intent).toBe('tutor');
  });

  it('repairs one invalid coordinator structure without losing the run state', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ raw: { usage_metadata: {} }, parsed: { intent: 'tutor' } })
      .mockResolvedValueOnce({
        raw: { usage_metadata: {} },
        parsed: { intent: 'tutor', assignmentId: null, missingFields: [], responseMode: 'answer' },
      });
    const gateway = {
      provider: 'fake', modelName: 'fake-model',
      createChatModel: () => ({ withStructuredOutput: () => ({ invoke }) }) as never,
      recordUsage: vi.fn(),
    } satisfies ModelGateway;
    const result = await createSpecialists(gateway).coordinate(state);
    expect(result.intent).toBe('repair_plan');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][0].at(-1).content).toMatch(/previous response/i);
  });
});
