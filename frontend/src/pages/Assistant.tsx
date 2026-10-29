import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DashboardNav from '@/components/layout/DashboardNav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/shared/api/client';
import type { RuntimeCapabilities } from '@/shared/api/types';

type Thread = { id: string; title: string | null; last_activity_at: string };
type MessageMetadata = {
  kind?: 'answer' | 'tutor' | 'clarification' | 'plan' | 'proposal' | 'failure';
  runId?: string;
  citations?: Array<{ title: string; url: string }>;
  suggestedActions?: Array<{ label: string; prompt: string }>;
  planSource?: 'agentic' | 'fallback';
};
type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; content_metadata?: MessageMetadata; created_at: string };
type Run = { id: string; status: string; current_step?: string; failure_message?: string | null };
type ApprovalItem = { logical_task_id: string; task_description: string; scheduled_date: string; estimated_minutes: number; operation: string };
type Approval = { id: string; run_id: string; assignment_title: string; proposal_hash: string; rationale: string | null; items: ApprovalItem[] };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'waiting_for_input', 'waiting_for_approval']);
const safeUrl = (url: string) => {
  try { return new URL(url).protocol === 'https:' ? defaultUrlTransform(url) : ''; } catch { return ''; }
};

function AssistantMessage({ message, onAction }: { message: Message; onAction: (prompt: string) => void }) {
  const user = message.role === 'user';
  return <article className={`assistant-message ${user ? 'assistant-message-user' : 'assistant-message-response'}`}>
    <p className="assistant-message-author">{user ? 'You' : 'Disciplan'}</p>
    <div className={user ? 'whitespace-pre-wrap' : 'assistant-message-copy'}>
      {user ? message.content : <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl} components={{
      a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="assistant-inline-link">{children}</a>,
      ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
      code: ({ children }) => <code className="assistant-inline-code">{children}</code>,
      p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
      }}>{message.content}</ReactMarkdown>}
    </div>
    {!user && message.content_metadata?.citations?.length ? <div className="assistant-resources">
      <p className="assistant-message-label">Verified resources</p>
      <ul>{message.content_metadata.citations.map((citation) => <li key={citation.url}>
        <a href={safeUrl(citation.url)} target="_blank" rel="noopener noreferrer" className="assistant-inline-link">{citation.title}</a>
      </li>)}</ul>
    </div> : null}
    {!user && message.content_metadata?.suggestedActions?.length ? <div className="assistant-suggested-actions">
      {message.content_metadata.suggestedActions.map((action) => <Button key={`${action.label}-${action.prompt}`} type="button" variant="outline" size="sm" onClick={() => onAction(action.prompt)}>{action.label}</Button>)}
    </div> : null}
    {!user && message.content_metadata?.planSource === 'fallback' ? <p className="assistant-fallback-note">A deterministic fallback plan was used.</p> : null}
  </article>;
}

export default function Assistant() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);

  const loadThreads = useCallback(async () => {
    const response = await apiRequest<{ threads: Thread[] }>('/api/agent-threads', { method: 'GET', headers: {} });
    setThreads(response.threads);
    setActiveThreadId((current) => current || response.threads[0]?.id || null);
  }, []);

  const loadConversation = useCallback(async (threadId: string) => {
    const response = await apiRequest<{ messages: Message[] }>(`/api/agent-threads/${threadId}`, { method: 'GET', headers: {} });
    setMessages(response.messages);
  }, []);

  const loadApprovals = useCallback(async () => {
    const response = await apiRequest<{ approvals: Omit<Approval, 'items'>[] }>('/api/approvals?status=pending', { method: 'GET', headers: {} });
    const details = await Promise.all(response.approvals.map(async (approval) => {
      const detail = await apiRequest<{ items: ApprovalItem[] }>(`/api/approvals/${approval.id}`, { method: 'GET', headers: {} });
      return { ...approval, items: detail.items };
    }));
    setApprovals(details);
  }, []);

  useEffect(() => { void loadThreads().catch(() => setError('Could not load conversations.')); }, [loadThreads]);
  useEffect(() => { void loadApprovals().catch(() => undefined); }, [loadApprovals]);
  useEffect(() => {
    void apiRequest<RuntimeCapabilities>('/api/runtime-capabilities', { method: 'GET', headers: {} })
      .then(setCapabilities)
      .catch(() => setError('Could not determine whether conversational planning is available.'));
  }, []);
  useEffect(() => {
    if (activeThreadId) void loadConversation(activeThreadId).catch(() => setError('Could not load this conversation.'));
    else setMessages([]);
  }, [activeThreadId, loadConversation]);

  useEffect(() => {
    if (!activeRun || TERMINAL.has(activeRun.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiRequest<{ run: Run }>(`/api/agent-runs/${activeRun.id}`, { method: 'GET', headers: {} });
        setActiveRun(response.run);
        if (TERMINAL.has(response.run.status) && activeThreadId) {
          await loadConversation(activeThreadId);
          await loadThreads();
          await loadApprovals();
        }
      } catch { setError('Could not refresh agent progress.'); }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeRun, activeThreadId, loadApprovals, loadConversation, loadThreads]);

  const decideApproval = async (approval: Approval, decision: 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/approvals/${approval.id}/decision`, {
        method: 'POST', body: JSON.stringify({ decision, proposalHash: approval.proposal_hash }),
      });
      setApprovals((current) => current.filter((item) => item.id !== approval.id));
      setActiveRun({ id: approval.run_id, status: 'accepted', current_step: 'resuming_approval' });
      await loadThreads();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Could not record approval decision.');
      await loadApprovals();
    }
  };

  const createThread = async () => {
    if (!capabilities?.conversationalPlanning) return;
    const response = await apiRequest<{ thread: Thread }>('/api/agent-threads', { method: 'POST', body: JSON.stringify({}) });
    setThreads((current) => [response.thread, ...current]);
    setActiveThreadId(response.thread.id);
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!capabilities?.conversationalPlanning) return;
    const content = draft.trim();
    if (!content) return;
    setError('');
    let threadId = activeThreadId;
    if (!threadId) {
      const response = await apiRequest<{ thread: Thread }>('/api/agent-threads', { method: 'POST', body: JSON.stringify({}) });
      threadId = response.thread.id;
      setThreads((current) => [response.thread, ...current]);
      setActiveThreadId(threadId);
    }
    const clientMessageId = crypto.randomUUID();
    setMessages((current) => [...current, { id: clientMessageId, role: 'user', content, created_at: new Date().toISOString() }]);
    setDraft('');
    try {
      const response = await apiRequest<{ run: Run }>(`/api/agent-threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          content,
          clientMessageId,
          ...(activeRun?.status === 'waiting_for_input' ? { replyToRunId: activeRun.id } : {}),
        }),
      });
      setActiveRun(response.run);
    } catch (sendError) {
      setDraft(content);
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.');
      await loadConversation(threadId);
    }
  };

  const retryRun = async () => {
    if (!activeRun || activeRun.status !== 'failed') return;
    setError('');
    try {
      const response = await apiRequest<{ run: Run }>(`/api/agent-runs/${activeRun.id}/retry`, { method: 'POST' });
      setActiveRun(response.run);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'The assistant response could not be retried.');
    }
  };

  return <div className="page-shell min-h-screen">
    <DashboardNav />
    <main className="app-container assistant-workspace">
      <Card className="assistant-sidebar">
        <div className="assistant-sidebar-heading">
          <p className="app-eyebrow">Workspace</p>
          <h2>Conversations</h2>
        </div>
        <Button className="assistant-new-thread" variant="outline" disabled={!capabilities?.conversationalPlanning} onClick={() => void createThread()}>
          <MessageSquarePlus className="w-4 h-4 mr-2" /> New conversation
        </Button>
        <nav aria-label="Conversations" className="assistant-thread-list">
          {threads.map((thread) => <button key={thread.id} type="button" onClick={() => setActiveThreadId(thread.id)}
            aria-current={thread.id === activeThreadId ? 'page' : undefined}
            className={thread.id === activeThreadId ? 'is-active' : undefined}>
            <span>{thread.title || 'New conversation'}</span>
            <time dateTime={thread.last_activity_at}>{new Date(thread.last_activity_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
          </button>)}
          {threads.length === 0 && <p className="assistant-no-threads">No conversations yet.</p>}
        </nav>
      </Card>
      <Card className="assistant-thread">
        <header className="assistant-thread-header">
          <span className="assistant-mark" aria-hidden="true"><Bot /></span>
          <div><p className="app-eyebrow">Planning workspace</p><h1>Disciplan Assistant</h1></div>
        </header>
        <section aria-live="polite" className="assistant-transcript">
          {messages.length === 0 && <div className="assistant-empty"><span className="assistant-mark" aria-hidden="true"><Bot /></span><p>What would you like to learn or plan?</p><span>Ask for an explanation, a guided study session, resources, a task breakdown, or a schedule.</span></div>}
          {messages.map((message) => <AssistantMessage key={message.id} message={message} onAction={setDraft} />)}
          {approvals.map((approval) => <Card key={approval.id} className="assistant-approval">
            <div className="assistant-approval-heading"><p className="assistant-message-label">Approval required</p><h2>Review changes for {approval.assignment_title}</h2></div>
            {approval.rationale && <p className="assistant-approval-rationale">{approval.rationale}</p>}
            <ul className="assistant-approval-items">{approval.items.map((item) => <li key={`${item.logical_task_id}-${item.operation}`}>
              <span className={item.operation === 'remove' ? 'is-remove' : 'is-change'}>{item.operation}</span>
              <span>{item.task_description}</span>
              <span><time dateTime={item.scheduled_date}>{item.scheduled_date}</time> · {item.estimated_minutes} min</span>
            </li>)}</ul>
            <div className="assistant-approval-actions"><Button variant="outline" onClick={() => void decideApproval(approval, 'reject')}>Keep current plan</Button><Button onClick={() => void decideApproval(approval, 'approve')}>Approve changes</Button></div>
          </Card>)}
          {activeRun && !TERMINAL.has(activeRun.status) && <div className="assistant-run-status"><Loader2 className="animate-spin" /> {activeRun.current_step || activeRun.status}</div>}
          {activeRun?.status === 'waiting_for_input' && <p className="assistant-status-note" role="status">Reply below when you are ready. I will keep the context we already discussed.</p>}
          {activeRun?.status === 'failed' && <div className="assistant-status-note" role="status"><span>Your message is saved, but the response could not be completed.</span><Button type="button" size="sm" variant="outline" onClick={() => void retryRun()}>Retry</Button></div>}
          {capabilities && !capabilities.conversationalPlanning && <p className="assistant-status-note" role="status">Conversational planning is not enabled in this environment. You can still create a deterministic plan from the Dashboard.</p>}
          {error && <p className="assistant-error" role="alert">{error}</p>}
        </section>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <Textarea aria-label="Message Disciplan" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!capabilities?.conversationalPlanning} maxLength={4000} placeholder={capabilities?.conversationalPlanning ? 'Teach me pointers, quiz me on chapter 1, or help me plan…' : 'Conversational planning is unavailable'} />
          <Button type="submit" size="icon" disabled={!draft.trim() || !capabilities?.conversationalPlanning} aria-label="Send message"><Send /></Button>
        </form>
      </Card>
    </main>
  </div>;
}
