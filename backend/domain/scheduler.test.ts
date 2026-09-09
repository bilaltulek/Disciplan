import { describe, expect, it } from 'vitest';

const { addDays, enumerateDates, parseDateOnly, todayInTimezone } = require('./date-only');
const { allocateTasks, buildDailyCapacity } = require('./scheduler');

describe('date-only planning primitives', () => {
  it('rejects calendar rollover and handles leap days', () => {
    expect(parseDateOnly('2025-02-29')).toBeNull();
    expect(parseDateOnly('2024-02-29')).not.toBeNull();
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('enumerates inclusive deterministic horizons', () => {
    expect(enumerateDates('2026-01-30', '2026-02-01')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
  });

  it('derives the calendar day in the student timezone', () => {
    const now = new Date('2026-01-02T01:30:00.000Z');
    expect(todayInTimezone('America/Chicago', now)).toBe('2026-01-01');
  });
});

describe('capacity-aware task allocation', () => {
  const profile = {
    timezone: 'UTC',
    weekdayAvailableMinutes: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 },
    maxDailyMinutes: 60,
    preferredSessionMinutes: 30,
  };

  it('uses safe defaults when a user has no persisted planning profile yet', () => {
    expect(allocateTasks({
      descriptions: ['Read requirements'],
      startDate: '2026-08-25',
      dueDate: '2026-08-25',
      profile: null,
    })).toEqual([{
      task_description: 'Read requirements',
      scheduled_date: '2026-08-25',
      estimated_minutes: 45,
    }]);
  });

  it('subtracts existing cross-assignment load', () => {
    expect(buildDailyCapacity({
      startDate: '2026-08-25',
      dueDate: '2026-08-25',
      profile,
      existingLoad: { '2026-08-25': 45 },
    })).toEqual([{ date: '2026-08-25', capacityMinutes: 15 }]);
  });

  it('is deterministic and stays within daily capacity', () => {
    const input = {
      descriptions: ['Outline', 'Draft', 'Review'],
      startDate: '2026-08-25',
      dueDate: '2026-08-26',
      profile,
    };
    const first = allocateTasks(input);
    expect(allocateTasks(input)).toEqual(first);
    expect(first).toEqual([
      { task_description: 'Outline', scheduled_date: '2026-08-25', estimated_minutes: 30 },
      { task_description: 'Draft', scheduled_date: '2026-08-25', estimated_minutes: 30 },
      { task_description: 'Review', scheduled_date: '2026-08-26', estimated_minutes: 30 },
    ]);
  });
});
