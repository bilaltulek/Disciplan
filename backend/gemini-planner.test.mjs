import { describe, expect, it } from 'vitest';
import planner from './gemini-planner.js';

describe('reviewer agent prompt boundary', () => {
  it('includes only structured planning fields and excludes private assignment context', () => {
    const prompt = planner.buildReviewPrompt({
      assignment: {
        userId: 90210,
        title: 'Calculus midterm',
        description: 'PRIVATE assignment notes must never enter reviewer context.',
        complexity: 'Hard',
        dueDate: '2099-06-30',
        totalItems: 20,
      },
      tasks: [{ task_description: 'Review integrals', scheduled_date: '2099-06-01', estimated_minutes: 45 }],
      validationIssues: ['Task count is bounded.'],
    });

    expect(prompt).toContain('Calculus midterm');
    expect(prompt).toContain('Review integrals');
    expect(prompt).not.toContain('PRIVATE assignment notes');
    expect(prompt).not.toContain('90210');
  });
});
