import { describe, expect, it, vi } from 'vitest';
import { detectScheduleConflicts, ScheduleHealthService } from './schedule-health.js';

describe('deterministic schedule health detection', () => {
  it('detects missed work and daily overload without a model call', () => {
    const conflicts = detectScheduleConflicts({
      today: '2026-08-25', dueDate: '2026-09-01',
      weekdayAvailableMinutes: { 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 0, 0: 0 },
      maxDailyMinutes: 60,
      tasks: [
        { id: 1, scheduledDate: '2026-08-24', estimatedMinutes: 30, completed: false },
        { id: 2, scheduledDate: '2026-08-25', estimatedMinutes: 40, completed: false },
        { id: 3, scheduledDate: '2026-08-25', estimatedMinutes: 40, completed: false },
      ],
    });
    expect(conflicts).toEqual(['DAILY_OVERLOAD:2026-08-25', 'MISSED_TASK:1']);
  });

  it('returns no conflicts for a healthy plan', () => {
    expect(detectScheduleConflicts({
      today: '2026-08-25', dueDate: '2026-09-01',
      weekdayAvailableMinutes: { 2: 60 }, maxDailyMinutes: 60,
      tasks: [{ id: 1, scheduledDate: '2026-08-25', estimatedMinutes: 30, completed: false }],
    })).toEqual([]);
  });

  it('passes a validation-owner allowlist into the scan query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(new ScheduleHealthService({ query } as never).scan(25, [42])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('a.user_id = ANY'), [3000, [42]]);
  });
});
