import { Command, MemorySaver } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';
import { createInitialGraphState } from './graph-state.js';
import { createSupervisorGraph, type SupervisorDependencies } from './supervisor-graph.js';

const validDraft = {
  rationale: 'A bounded test plan.',
  assumptions: [],
  tasks: [{ taskDescription: 'Review requirements', scheduledDate: '2026-09-01', estimatedMinutes: 30 }],
};

const dependencies = (): SupervisorDependencies => ({
  loadContext: vi.fn(async () => ({
    assignmentId: 1,
    assignment: { id: 1, title: 'Essay', description: '', complexity: 'Medium' as const, dueDate: '2026-09-02', totalItems: 3 },
    planningProfile: { timezone: 'UTC', weekdayAvailableMinutes: { 1: 60 }, maxDailyMinutes: 60, preferredSessionMinutes: 30, version: 1 },
  })),
  coordinate: vi.fn(async () => ({ intent: 'publish_initial_plan' as const, assignmentId: 1, missingFields: [], responseMode: 'plan' as const })),
  materializeAssignment: vi.fn(async () => ({ assignmentId: 1 })),
  createPlan: vi.fn(async () => ({ draft: validDraft, usingFallback: false })),
  repairPlan: vi.fn(async () => ({ draft: validDraft, usingFallback: false })),
  reviewPlan: vi.fn(async () => ({ accept: true, issues: [] })),
  validatePlan: vi.fn(async () => []),
  fallbackPlan: vi.fn(async () => validDraft),
  saveDraft: vi.fn(async () => ({ planVersionId: '4f780b9e-38a5-4c02-9853-9fd0b6ec66ba', proposalHash: 'a'.repeat(64) })),
  publishInitial: vi.fn(async () => undefined),
  publishRepair: vi.fn(async () => undefined),
  createApproval: vi.fn(async () => ({ approvalId: 'bbdfc4a0-af2b-4cf4-a3de-70b0bf55d45f', proposalHash: 'a'.repeat(64) })),
  answer: vi.fn(async () => 'Your plan is ready.'),
});

describe('explicit Disciplan supervisor graph', () => {
  it('persists typed state through validation, review, draft, and initial publication', async () => {
    const deps = dependencies();
    const graph = createSupervisorGraph(deps);
    const result = await graph.invoke(createInitialGraphState({
      runId: '5e4bfbe2-4b2b-4e66-9ad6-4f93ff1a2f86',
      actorUserId: 7,
      assignmentId: 1,
      runType: 'initial_plan',
      triggerType: 'assignment_form',
      userRequest: 'Create a plan.',
    }));
    expect(result.finalResponse).toBe('Your plan is ready.');
    expect(result.candidatePlan).toEqual(validDraft);
    expect(result.planVersionId).toBeTruthy();
    expect(deps.publishInitial).toHaveBeenCalledOnce();
    expect(deps.createApproval).not.toHaveBeenCalled();
  });

  it('uses one revision then deterministic fallback when validation keeps failing', async () => {
    const deps = dependencies();
    vi.mocked(deps.validatePlan)
      .mockResolvedValueOnce(['invalid'])
      .mockResolvedValueOnce(['still invalid'])
      .mockResolvedValueOnce([]);
    const graph = createSupervisorGraph(deps);
    const result = await graph.invoke(createInitialGraphState({
      runId: '5e4bfbe2-4b2b-4e66-9ad6-4f93ff1a2f86', actorUserId: 7,
      assignmentId: 1, runType: 'initial_plan', triggerType: 'assignment_form', userRequest: 'Create a plan.',
    }));
    expect(deps.createPlan).toHaveBeenCalledTimes(2);
    expect(deps.fallbackPlan).toHaveBeenCalledOnce();
    expect(deps.reviewPlan).not.toHaveBeenCalled();
    expect(result.usingFallback).toBe(true);
  });

  it('persists a shadow draft without publishing or creating an approval', async () => {
    const deps = dependencies();
    const graph = createSupervisorGraph(deps);
    const result = await graph.invoke(createInitialGraphState({
      runId: 'e395ff17-6ed0-4ba2-9ac2-86876fd730a7', actorUserId: 7,
      assignmentId: 1, runType: 'initial_plan', triggerType: 'user_request',
      userRequest: 'Evaluate this plan.', shadowMode: true,
    }));
    expect(result.planVersionId).toBeTruthy();
    expect(deps.publishInitial).not.toHaveBeenCalled();
    expect(deps.createApproval).not.toHaveBeenCalled();
  });

  it('checkpoints a clarification interrupt and resumes without executing planning early', async () => {
    const deps = dependencies();
    vi.mocked(deps.coordinate)
      .mockResolvedValueOnce({ intent: 'clarify', assignmentId: 1, missingFields: ['dueDate'], responseMode: 'question' })
      .mockResolvedValueOnce({ intent: 'publish_initial_plan', assignmentId: 1, missingFields: [], responseMode: 'plan' });
    const graph = createSupervisorGraph(deps, { checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: 'clarification-test' } };
    const interrupted = await graph.invoke(createInitialGraphState({
      runId: 'fd07c31a-d0f8-48a7-af0e-7a89c56a234d', actorUserId: 7,
      assignmentId: 1, runType: 'conversation', triggerType: 'user_message', userRequest: 'Plan my essay.',
    }), config);
    expect((interrupted as typeof interrupted & { __interrupt__: unknown[] }).__interrupt__).toHaveLength(1);
    expect(deps.createPlan).not.toHaveBeenCalled();

    const resumed = await graph.invoke(new Command({ resume: { response: 'It is due September 2.' } }), config);
    expect(resumed.finalResponse).toBe('Your plan is ready.');
    expect(deps.coordinate).toHaveBeenCalledTimes(2);
    const secondState = vi.mocked(deps.coordinate).mock.calls[1][0];
    expect(secondState.originalGoal).toBe('Plan my essay.');
    expect(secondState.latestUserMessage).toBe('It is due September 2.');
    expect(secondState.conversationMessages.at(-1)?.content).toBe('It is due September 2.');
    expect(deps.createPlan).toHaveBeenCalledOnce();
    expect(deps.publishInitial).toHaveBeenCalledOnce();
  });

  it('checkpoints an approval interrupt and resumes the exact proposal without repeating model nodes', async () => {
    const deps = dependencies();
    vi.mocked(deps.coordinate).mockResolvedValue({
      intent: 'repair_plan', assignmentId: 1, missingFields: [], responseMode: 'plan',
    });
    vi.mocked(deps.loadContext).mockResolvedValue({
      assignmentId: 1,
      assignment: { id: 1, title: 'Essay', description: '', complexity: 'Medium', dueDate: '2026-09-02', totalItems: 3 },
      planningProfile: { timezone: 'UTC', weekdayAvailableMinutes: { 1: 60 }, maxDailyMinutes: 60, preferredSessionMinutes: 30, version: 1 },
      existingPlanVersionId: 'c537df97-58b4-4c9a-ad70-d62b258923ab',
    });
    const graph = createSupervisorGraph(deps, { checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: 'approval-test' } };
    const interrupted = await graph.invoke(createInitialGraphState({
      runId: 'd0377378-3a1a-416d-aa41-63d28f4caa3a', actorUserId: 7,
      assignmentId: 1, runType: 'repair', triggerType: 'user_request', userRequest: 'Move unfinished work.',
    }), config);
    expect((interrupted as typeof interrupted & { __interrupt__: unknown[] }).__interrupt__).toHaveLength(1);
    expect(deps.createApproval).toHaveBeenCalledOnce();
    expect(deps.publishRepair).not.toHaveBeenCalled();

    const resumed = await graph.invoke(new Command({
      resume: { decision: 'approve', proposalHash: 'a'.repeat(64) },
    }), config);
    expect(resumed.finalResponse).toBe('Your plan is ready.');
    expect(deps.repairPlan).toHaveBeenCalledOnce();
    expect(deps.reviewPlan).toHaveBeenCalledOnce();
    expect(deps.createApproval).toHaveBeenCalledOnce();
    expect(deps.publishRepair).toHaveBeenCalledOnce();
  });
});
