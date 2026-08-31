import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskCard from './TaskCard';
import type { AssignmentSummary } from '@/shared/api/types';
import { apiRequest } from '@/shared/api/client';

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }));

const assignment: AssignmentSummary = {
  id: 7,
  title: 'Calculus midterm',
  description: 'Review units 1 through 4.',
  complexity: 'Hard',
  due_date: '2099-06-30',
  total_items: 20,
  total_subtasks: 0,
  completed_subtasks: 0,
};

describe('TaskCard planning states', () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
  it('shows a non-interactive queued state while a plan is being generated', () => {
    render(<TaskCard task={{ ...assignment, plan_generation_status: 'queued', plan_generation_step: 'intake' }} onDeleteAssignment={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Plan Queued' })).toBeDisabled();
    expect(screen.getByText('intake.')).toBeInTheDocument();
  });

  it('discloses when the published plan came from deterministic fallback', () => {
    render(<TaskCard task={{ ...assignment, plan_generation_source: 'fallback_limit' }} onDeleteAssignment={vi.fn()} />);
    expect(screen.getByText('Deterministic fallback plan')).toBeInTheDocument();
  });

  it('shows the safe failure message and retries only the associated run', () => {
    const retry = vi.fn();
    render(<TaskCard task={{ ...assignment, plan_generation_status: 'failed', plan_generation_run_id: 'run-7', plan_generation_failure_message: 'The generated plan did not meet scheduling requirements.' }} onDeleteAssignment={vi.fn()} onRetryRun={retry} />);
    expect(screen.getByText('The generated plan did not meet scheduling requirements.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('run-7');
  });

  it('submits bounded feedback for the owned published assignment plan', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([{
        id: 11, assignment_id: assignment.id, task_description: 'Review derivatives',
        scheduled_date: '2099-06-20', completed: false, estimated_minutes: 30,
      }])
      .mockResolvedValueOnce({ feedback: { id: 'feedback-1', feedback_type: 'helpful' } });
    render(<TaskCard task={{ ...assignment, total_subtasks: 1 }} onDeleteAssignment={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Plan' }));
    await screen.findByText('Review derivatives');
    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/api/assignments/7/feedback', {
      method: 'POST', body: JSON.stringify({ feedbackType: 'helpful' }),
    }));
    expect(await screen.findByText('Feedback saved.')).toBeInTheDocument();
  });
});
