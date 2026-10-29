import { useEffect } from 'react';
import type { AssignmentSummary } from '@/shared/api/types';

const ACTIVE_RUN_STATUSES = new Set(['accepted', 'queued', 'running', 'waiting_for_input', 'waiting_for_approval', 'reviewing', 'revising']);
const INITIAL_DELAY_MS = 5_000;
const MAX_DELAY_MS = 30_000;

export function useActiveRunPolling(
  assignments: AssignmentSummary[],
  refresh: () => Promise<void>,
) {
  useEffect(() => {
    if (!assignments.some((assignment) => ACTIVE_RUN_STATUSES.has(assignment.plan_generation_status || ''))) {
      return undefined;
    }

    let cancelled = false;
    let timer: number | undefined;
    let delay = INITIAL_DELAY_MS;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        try {
          await refresh();
          delay = INITIAL_DELAY_MS;
        } catch {
          delay = Math.min(delay * 2, MAX_DELAY_MS);
        }
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [assignments, refresh]);
}
