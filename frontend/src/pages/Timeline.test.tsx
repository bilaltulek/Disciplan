import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import Timeline from './Timeline';
import { apiRequest } from '@/shared/api/client';
import type { AssignmentSummary, ScheduledTask } from '@/shared/api/types';

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/layout/DashboardNav', () => ({ default: () => <nav>Navigation</nav> }));

const tasks: ScheduledTask[] = [
  { id: 1, assignment_id: 10, task_description: 'Review process notes', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: '2026-12-31', estimated_minutes: 40, completed: true },
  { id: 2, assignment_id: 10, task_description: 'Trace process calls', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: '2026-12-31', estimated_minutes: 80, completed: false },
  { id: 3, assignment_id: 11, task_description: 'Practice derivatives', assignment_title: 'Calculus midterm', complexity: 'Medium', scheduled_date: '2026-12-31', estimated_minutes: 20, completed: false },
  { id: 4, assignment_id: 10, task_description: 'Write lab report', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: '2027-01-01', estimated_minutes: 45, completed: false },
  { id: 5, assignment_id: 11, task_description: 'Take practice exam', assignment_title: 'Calculus midterm', complexity: 'Medium', scheduled_date: '2027-01-10', estimated_minutes: 60, completed: false },
  { id: 6, assignment_id: 10, task_description: 'Read earlier notes', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: '2026-12-30', estimated_minutes: null, completed: true },
];

const assignments: AssignmentSummary[] = [
  { id: 10, title: 'Operating Systems lab', description: '', complexity: 'Hard', due_date: '2027-01-04', total_items: 3, total_subtasks: 3, completed_subtasks: 1 },
  { id: 11, title: 'Calculus midterm', description: '', complexity: 'Medium', due_date: '2027-01-12', total_items: 2, total_subtasks: 2, completed_subtasks: 0 },
];

const configureApi = (settings: { metadataFailure?: boolean; toggleFailure?: boolean } = {}) => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === '/api/timeline') return tasks;
    if (path === '/api/assignments') {
      if (settings.metadataFailure) throw new Error('Assignment request failed');
      return assignments;
    }
    if (path === '/api/tasks/2/toggle' && options?.method === 'PATCH') {
      if (settings.toggleFailure) throw new Error('Completion request failed');
      return { message: 'Task updated' };
    }
    if (path === '/api/tasks/4' && options?.method === 'PATCH') return { message: 'Task updated' };
    if (path === '/api/tasks/3' && options?.method === 'DELETE') return { message: 'Task deleted' };
    return {};
  });
};

describe('Timeline agenda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 11, 31, 12));
    vi.mocked(apiRequest).mockReset();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders a seven-day, today-first agenda with assignment groups and later and earlier work', async () => {
    configureApi();
    render(<Timeline />);

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Thursday, December 31')).toBeInTheDocument();
    const summary = screen.getByLabelText('Today summary');
    expect(summary).toHaveTextContent('3 tasks');
    expect(summary).toHaveTextContent('1 complete');
    expect(summary).toHaveTextContent('1h 40m remaining');

    const overview = screen.getByRole('navigation', { name: 'Upcoming seven days' });
    expect(within(overview).getAllByRole('button')).toHaveLength(7);
    expect(within(overview).getByRole('button', { name: 'Go to Friday, January 1' })).toHaveTextContent('1 task');

    const todaySection = document.querySelector('#timeline-day-2026-12-31');
    expect(todaySection).not.toBeNull();
    expect(within(todaySection as HTMLElement).getByRole('heading', { name: 'Operating Systems lab' })).toBeInTheDocument();
    expect(within(todaySection as HTMLElement).getByText('Due Jan 4')).toBeInTheDocument();
    expect(within(todaySection as HTMLElement).getByLabelText('Operating Systems lab progress')).toHaveTextContent('1 / 3 complete');
    expect(document.querySelector('#timeline-day-2027-01-10')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Past scheduled days' })).toBeInTheDocument();

    fireEvent.click(within(overview).getByRole('button', { name: 'Go to Friday, January 1' }));
    const tomorrowSection = document.querySelector('#timeline-day-2027-01-01') as HTMLElement;
    expect(tomorrowSection.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(tomorrowSection);
  });

  it('hides completed rows without changing the summary or overview counts', async () => {
    configureApi();
    render(<Timeline />);
    await screen.findByText('Review process notes');

    fireEvent.click(screen.getByRole('button', { name: 'Hide completed' }));
    expect(screen.queryByText('Review process notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Read earlier notes')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Today summary')).toHaveTextContent('3 tasks');
    expect(screen.getByLabelText('Today summary')).toHaveTextContent('1 complete');
    expect(screen.getByRole('button', { name: 'Show completed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Go to Thursday, December 31' })).toHaveTextContent('1 / 3');
  });

  it('updates completion and assignment progress optimistically, then rolls back a failed request', async () => {
    configureApi({ toggleFailure: true });
    render(<Timeline />);
    const toggle = await screen.findByRole('checkbox', { name: 'Mark Trace process calls complete' });

    fireEvent.click(toggle);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/tasks/2/toggle', {
      method: 'PATCH', body: JSON.stringify({ completed: true }),
    }));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(alert).toHaveBeenCalledWith('Completion request failed');
    expect(screen.getAllByLabelText('Operating Systems lab progress')[0]).toHaveTextContent('1 / 3 complete');
  });

  it('keeps tasks usable when assignment enrichment fails and supports edit and delete mutations', async () => {
    configureApi({ metadataFailure: true });
    render(<Timeline />);
    expect(await screen.findByText('Some assignment details are temporarily unavailable. Tasks are still ready to use.')).toBeInTheDocument();
    expect(screen.getByText('Trace process calls')).toBeInTheDocument();
    expect(screen.queryByText('Due Jan 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Write lab report' }));
    fireEvent.change(screen.getByLabelText('Task Description'), { target: { value: 'Polish lab report' } });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/tasks/4', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ task_description: 'Polish lab report', scheduled_date: '2027-01-01', estimated_minutes: 50, completed: false }),
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Practice derivatives' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/tasks/3', { method: 'DELETE', headers: {} }));
    await waitFor(() => expect(screen.queryByText('Practice derivatives')).not.toBeInTheDocument());
  });

  it('shows a retryable error when the required Timeline request fails', async () => {
    let timelineCalls = 0;
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/api/assignments') return [];
      if (path === '/api/timeline') {
        timelineCalls += 1;
        if (timelineCalls === 1) throw new Error('Timeline request failed');
        return tasks;
      }
      return {};
    });
    render(<Timeline />);

    expect(await screen.findByRole('heading', { name: 'Timeline unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Trace process calls')).toBeInTheDocument();
    expect(timelineCalls).toBe(2);
  });
});
