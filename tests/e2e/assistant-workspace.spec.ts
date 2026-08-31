import { expect, test } from '@playwright/test';

test('authenticated assistant supports messages and exact proposal decisions', async ({ page }) => {
  let approvalPending = true;
  const threadId = 'cefe6b1d-d448-4446-a6c2-d91a21a2b229';
  const runId = '2bc42060-f4b6-4c16-88b0-2c74b6206752';
  const approvalId = '3cc3fb5d-eb57-416b-a42b-526703e26b67';
  const proposalHash = 'a'.repeat(64);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = `${url.pathname}${url.search}`;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (url.pathname === '/api/me') return json({ user: { id: 7, email: 'student@example.invalid', name: 'Student' } });
    if (url.pathname === '/api/settings') return json({ settings: { theme_mode: 'light', start_page: 'dashboard' } });
    if (url.pathname === '/api/runtime-capabilities') return json({
      mode: 'active', conversationalPlanning: true, asynchronousFormPlanning: true,
    });
    if (path === '/api/agent-threads?limit=30' || url.pathname === '/api/agent-threads') {
      if (request.method() === 'POST') return json({ thread: { id: threadId, title: null, last_activity_at: new Date().toISOString() } }, 201);
      return json({ threads: [{ id: threadId, title: 'Essay plan', last_activity_at: new Date().toISOString() }] });
    }
    if (url.pathname === `/api/agent-threads/${threadId}`) return json({ messages: [] });
    if (url.pathname === `/api/agent-threads/${threadId}/messages`) {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      expect(request.postDataJSON().content).toBe('Help me make Friday lighter.');
      return json({ run: { id: runId, status: 'waiting_for_input', current_step: 'clarification' } }, 202);
    }
    if (path === '/api/approvals?status=pending') {
      return json({ approvals: approvalPending ? [{
        id: approvalId, run_id: runId, assignment_title: 'Research essay',
        proposal_hash: proposalHash, rationale: 'Move one unfinished task.',
      }] : [] });
    }
    if (url.pathname === `/api/approvals/${approvalId}` && request.method() === 'GET') {
      return json({ items: [{
        logical_task_id: crypto.randomUUID(), task_description: 'Revise the conclusion',
        scheduled_date: '2026-09-04', estimated_minutes: 30, operation: 'move',
      }] });
    }
    if (url.pathname === `/api/approvals/${approvalId}/decision`) {
      expect(request.postDataJSON()).toEqual({ decision: 'reject', proposalHash });
      approvalPending = false;
      return json({ approval: { id: approvalId, status: 'rejected' }, run: { id: runId, status: 'accepted' } });
    }
    return json({ error: `Unhandled test route: ${path}` }, 500);
  });

  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'Disciplan Assistant' })).toBeVisible();
  await expect(page.getByText('Review changes for Research essay')).toBeVisible();
  await expect(page.getByText('Revise the conclusion')).toBeVisible();
  await page.getByRole('button', { name: 'Keep current plan' }).click();
  await expect(page.getByText('Review changes for Research essay')).toBeHidden();

  await page.getByLabel('Message Disciplan').fill('Help me make Friday lighter.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Help me make Friday lighter.')).toBeVisible();
});
