import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import Dashboard from './Dashboard';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary } from '@/shared/api/types';

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/layout/DashboardNav', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('@/shared/hooks/useActiveRunPolling', () => ({ useActiveRunPolling: vi.fn() }));
vi.mock('@/context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      assignment_default_complexity: 'Medium',
      assignment_default_items: 5,
      confirm_assignment_delete: true,
    },
  }),
}));
vi.mock('@/components/features/TaskCard', () => ({
  default: ({ task, onDeleteAssignment }: {
    task: AssignmentSummary;
    onDeleteAssignment: (assignment: AssignmentSummary) => void;
  }) => (
    <article>
      <h2>{task.title}</h2>
      <button type="button" onClick={() => onDeleteAssignment(task)}>
        Delete assignment {task.title}
      </button>
    </article>
  ),
}));

const assignment: AssignmentSummary = {
  id: 7,
  title: 'Calculus midterm',
  description: 'Review units 1 through 4.',
  complexity: 'Hard',
  due_date: '2099-06-30',
  total_items: 20,
  total_subtasks: 3,
  completed_subtasks: 1,
};

describe('Dashboard assignment deletion', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('persists deletion immediately so navigation cannot cancel it', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/api/assignments' && options?.method === 'GET') return [assignment];
      if (path === '/api/assignments/7' && options?.method === 'DELETE') {
        return { assignmentId: 7, deletedTaskCount: 3 };
      }
      return {};
    });
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete assignment Calculus midterm' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/assignments/7', {
      method: 'DELETE', headers: {},
    }));
    expect(screen.queryByRole('heading', { name: 'Calculus midterm' })).not.toBeInTheDocument();
  });

  it('restores the assignment if the persisted deletion fails', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/api/assignments' && options?.method === 'GET') return [assignment];
      if (path === '/api/assignments/7' && options?.method === 'DELETE') throw new Error('Delete failed');
      return {};
    });
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete assignment Calculus midterm' }));

    expect(await screen.findByRole('heading', { name: 'Calculus midterm' })).toBeInTheDocument();
    expect(alert).toHaveBeenCalledWith('Delete failed');
  });
});
