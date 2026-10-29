import { describe, expect, it } from 'vitest';
import type { PlanDraft } from '../../shared/contracts.js';
import { createInitialGraphState } from './graph-state.js';
import { classifyRunFailure, fallbackDraft } from './run-executor.js';

const { addDays, todayInTimezone } = require('../domain/date-only') as {
  addDays: (date: string, count: number) => string;
  todayInTimezone: (timezone: string) => string;
};

describe('deterministic repair fallback', () => {
  it('preserves completed work and reschedules only overdue unfinished tasks with stable logical IDs', () => {
    const today = todayInTimezone('UTC');
    const completedId = '81df5bed-9cbc-4c6d-ac15-8b66f2e853e9';
    const overdueId = '86b7c012-0b86-48f0-a555-59a6288be58d';
    const futureId = 'd0f18f0e-d29a-49cb-9441-3435f7d29528';
    const state = createInitialGraphState({
      runId: 'a72be11b-79dd-4322-b972-2431839cda39', actorUserId: 1,
      assignmentId: 4, runType: 'repair', triggerType: 'user_request', userRequest: 'Repair this plan.',
      assignment: { id: 4, title: 'Project', description: '', complexity: 'Medium', dueDate: addDays(today, 5), totalItems: 3 },
      planningProfile: {
        timezone: 'UTC', weekdayAvailableMinutes: { 0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 },
        maxDailyMinutes: 120, preferredSessionMinutes: 30, version: 1,
      },
      completedLogicalTaskIds: [completedId],
      existingPlan: [
        { logicalTaskId: completedId, taskDescription: 'Completed task', scheduledDate: addDays(today, -2), estimatedMinutes: 30 },
        { logicalTaskId: overdueId, taskDescription: 'Missed unfinished task', scheduledDate: addDays(today, -1), estimatedMinutes: 30 },
        { logicalTaskId: futureId, taskDescription: 'Unaffected future task', scheduledDate: addDays(today, 2), estimatedMinutes: 30 },
      ],
    });
    const draft = fallbackDraft(state) as PlanDraft;
    expect(draft.tasks.find((task) => task.logicalTaskId === completedId)?.scheduledDate).toBe(addDays(today, -2));
    expect(draft.tasks.find((task) => task.logicalTaskId === overdueId)?.scheduledDate).toBe(today);
    expect(draft.tasks.find((task) => task.logicalTaskId === futureId)?.scheduledDate).toBe(addDays(today, 2));
  });

  it('retries transient failures only within the bounded attempt budget', () => {
    expect(classifyRunFailure({ code: 'ETIMEDOUT' }, 1)).toEqual({ code: 'ETIMEDOUT', terminal: false });
    expect(classifyRunFailure({ code: 'ETIMEDOUT' }, 3)).toEqual({ code: 'ETIMEDOUT', terminal: true });
    expect(classifyRunFailure({ code: 'PLAN_PUBLISH_CONFLICT' }, 1)).toEqual({ code: 'PLAN_PUBLISH_CONFLICT', terminal: true });
  });
});
