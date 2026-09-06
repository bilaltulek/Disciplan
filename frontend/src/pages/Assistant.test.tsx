import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Assistant from './Assistant';
import { apiRequest } from '@/shared/api/client';

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/layout/DashboardNav', () => ({ default: () => <nav>Navigation</nav> }));

const configureApi = (active: boolean, settings: { runStatus?: string; messages?: Array<Record<string, unknown>> } = {}) => {
  vi.mocked(apiRequest).mockImplementation(async (path, requestOptions) => {
    if (!path) return {};
    if (path === '/api/runtime-capabilities') return {
      mode: active ? 'active' : 'off',
      conversationalPlanning: active,
      asynchronousFormPlanning: active,
      tutoring: active,
      groundedResources: active,
    };
    if (path === '/api/agent-threads' && requestOptions?.method === 'GET') return {
      threads: settings.messages?.length ? [{ id: 'thread-1', title: 'Pointers', last_activity_at: new Date().toISOString() }] : [],
    };
    if (path === '/api/agent-threads' && requestOptions?.method === 'POST') return {
      thread: { id: 'thread-1', title: null, last_activity_at: new Date().toISOString() },
    };
    if (path === '/api/approvals?status=pending') return { approvals: [] };
    if (path === '/api/agent-threads/thread-1/messages') return {
      run: { id: 'run-1', status: settings.runStatus || 'accepted', current_step: settings.runStatus || 'accepted' },
    };
    if (path === '/api/agent-threads/thread-1') return { messages: settings.messages || [] };
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

  it('sends the waiting run ID when answering a clarification', async () => {
    configureApi(true, { runStatus: 'waiting_for_input' });
    render(<Assistant />);
    const composer = await screen.findByLabelText('Message Disciplan');
    fireEvent.change(composer, { target: { value: 'Please schedule my OS review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText(/Reply below when you are ready/)).toBeInTheDocument());
    fireEvent.change(composer, { target: { value: 'Next Friday works.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => {
      const calls = vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/api/agent-threads/thread-1/messages');
      expect(JSON.parse(String(calls.at(-1)?.[1]?.body))).toMatchObject({ replyToRunId: 'run-1' });
    });
  });

  it('renders verified citations as safe external links', async () => {
    configureApi(true, { messages: [{
      id: 'assistant-1', role: 'assistant', content: '**Pointers** store addresses.', created_at: new Date().toISOString(),
      content_metadata: { kind: 'tutor', citations: [{ title: 'MIT resource', url: 'https://ocw.mit.edu/' }] },
    }] });
    render(<Assistant />);
    const link = await screen.findByRole('link', { name: 'MIT resource' });
    expect(link).toHaveAttribute('href', 'https://ocw.mit.edu/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
