import { describe, expect, it } from 'vitest';
import validator from './plan-validator.js';

const { validatePlan } = validator;
const assignment = { due_date: '2099-06-30' };

describe('validatePlan', () => {
  it('accepts a bounded future study task', () => {
    expect(validatePlan({
      assignment,
      tasks: [{ task_description: 'Review chapter one examples', scheduled_date: '2099-06-01', estimated_minutes: 45 }],
    })).toEqual([]);
  });

  it('rejects malformed and out-of-range model output', () => {
    const issues = validatePlan({
      assignment,
      tasks: [{ task_description: 'x', scheduled_date: '2099-07-01', estimated_minutes: 800 }],
    });
    expect(issues).toHaveLength(3);
  });

  it('allows an immutable completed task to retain its historical date without consuming future capacity', () => {
    expect(validatePlan({
      assignment: { due_date: '2099-06-30' },
      today: '2099-06-10',
      completedLogicalTaskIds: ['5b1c15c9-0cf7-4c26-96ae-58774963bd48'],
      profile: {
        timezone: 'UTC', weekdayAvailableMinutes: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        maxDailyMinutes: 60, preferredSessionMinutes: 30,
      },
      tasks: [{
        logical_task_id: '5b1c15c9-0cf7-4c26-96ae-58774963bd48',
        task_description: 'Completed historical research', scheduled_date: '2099-06-01', estimated_minutes: 45,
      }],
    })).toEqual([]);
  });

  it('rejects a structurally valid plan that omits explicitly requested focus topics', () => {
    const issues = validatePlan({
      assignment: {
        title: 'OS chapter 1', due_date: '2099-06-30',
        description: 'Review C syntax, pointers, and fork.',
      },
      tasks: [{ task_description: 'Read the chapter', scheduled_date: '2099-06-01', estimated_minutes: 45 }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^\[CONTENT_ALIGNMENT_FAILED\]/);
  });
});
