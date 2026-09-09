import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const { allocateTasks } = require('./scheduler');

describe('scheduler properties', () => {
  it('never exceeds capacity and is deterministic for arbitrary bounded workloads', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 15, max: 240 }),
      fc.integer({ min: 5, max: 120 }),
      (taskCount, dailyCapacity, preferred) => {
        const input = {
          descriptions: Array.from({ length: taskCount }, (_, index) => `Task ${index + 1}`),
          startDate: '2026-08-24',
          dueDate: '2026-08-30',
          profile: {
            timezone: 'UTC',
            weekdayAvailableMinutes: { 0: dailyCapacity, 1: dailyCapacity, 2: dailyCapacity, 3: dailyCapacity, 4: dailyCapacity, 5: dailyCapacity, 6: dailyCapacity },
            maxDailyMinutes: dailyCapacity,
            preferredSessionMinutes: Math.min(preferred, dailyCapacity),
          },
        };
        const first = allocateTasks(input);
        expect(allocateTasks(input)).toEqual(first);
        const totals = new Map<string, number>();
        for (const task of first) totals.set(task.scheduled_date, (totals.get(task.scheduled_date) || 0) + task.estimated_minutes);
        expect([...totals.values()].every((minutes) => minutes <= dailyCapacity)).toBe(true);
      },
    ), { numRuns: 150 });
  });
});
