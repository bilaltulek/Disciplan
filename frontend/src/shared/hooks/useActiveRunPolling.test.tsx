import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useActiveRunPolling } from './useActiveRunPolling';
import type { AssignmentSummary } from '@/shared/api/types';

const queuedAssignment: AssignmentSummary = {
  id: 1, title: 'Physics', description: '', complexity: 'Medium', due_date: '2099-06-30', total_items: 5,
  total_subtasks: 0, completed_subtasks: 0, plan_generation_status: 'queued',
};

describe('useActiveRunPolling', () => {
  it('polls active runs, backs off after failure, and stops when unmounted', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useActiveRunPolling([queuedAssignment], refresh));

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(refresh).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not schedule terminal runs', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useActiveRunPolling([{ ...queuedAssignment, plan_generation_status: 'succeeded' }], refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
