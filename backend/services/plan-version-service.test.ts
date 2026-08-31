import { describe, expect, it } from 'vitest';
import { comparePlanTasks, normalizeDraft, proposalHash } from './plan-version-service.js';

describe('plan version domain behavior', () => {
  const draft = {
    rationale: 'Sequence research before drafting.',
    assumptions: ['The rubric is complete.'],
    tasks: [
      { taskDescription: 'Research sources', scheduledDate: '2026-09-01', estimatedMinutes: 45 },
      { taskDescription: 'Write first draft', scheduledDate: '2026-09-02', estimatedMinutes: 60 },
    ],
  };

  it('assigns stable logical task IDs and proposal hashes', () => {
    const first = normalizeDraft(12, draft);
    const second = normalizeDraft(12, draft);
    expect(second).toEqual(first);
    expect(proposalHash(second)).toBe(proposalHash(first));
  });

  it('classifies changes by logical task ID', () => {
    const before = normalizeDraft(12, draft).tasks;
    const after = [
      { ...before[0], scheduledDate: '2026-09-03' },
      before[1],
      { taskDescription: 'Submit', scheduledDate: '2026-09-04', estimatedMinutes: 15, logicalTaskId: '99e9ac83-5a70-4d3c-a0f4-dc758bfc669a' },
    ];
    const diff = comparePlanTasks(before, after);
    expect(diff.moved).toHaveLength(1);
    expect(diff.retained).toHaveLength(1);
    expect(diff.added).toHaveLength(1);
    expect(diff.archived).toHaveLength(0);
  });
});
