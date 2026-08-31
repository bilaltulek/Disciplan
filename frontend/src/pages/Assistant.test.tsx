import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Assistant from './Assistant';
import { apiRequest } from '@/shared/api/client';

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/layout/DashboardNav', () => ({ default: () => <nav>Navigation</nav> }));

const configureApi = (active: boolean) => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (!path) return {};
    if (path === '/api/runtime-capabilities') return {
      mode: active ? 'active' : 'off',
      conversationalPlanning: active,
      asynchronousFormPlanning: active,
    };
    if (path === '/api/agent-threads' && options?.method === 'GET') return { threads: [] };
    if (path === '/api/agent-threads' && options?.method === 'POST') return {
      thread: { id: 'thread-1', title: null, last_activity_at: new Date().toISOString() },
    };
    if (path === '/api/approvals?status=pending') return { approvals: [] };
    if (path === '/api/agent-threads/thread-1/messages') return {
      run: { id: 'run-1', status: 'accepted', current_step: 'accepted' },
    };
    if (path === '/api/agent-threads/thread-1') return { messages: [] };
    return {};
  });
};

describe('Assistant runtime capabilities', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());
  afterEach(cleanup);

  it('disables conversation controls with a neutral explanation when runtime is off', async () => {
    configureApi(false);
    render(<Assistant />);
    expect(await screen.findByText(/Conversational planning is not enabled/)).toBeInTheDocument();
    expect(screen.getByLabelText('Message Disciplan')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeDisabled();
  });

  it('creates a durable message run when runtime is active', async () => {
    configureApi(true);
    render(<Assistant />);
    const composer = await screen.findByLabelText('Message Disciplan');
    await waitFor(() => expect(composer).not.toBeDisabled());
    fireEvent.change(composer, { target: { value: 'Help me plan OS chapter 1.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      '/api/agent-threads/thread-1/messages',
      expect.objectContaining({ method: 'POST' }),
    ));
  });
});
