import { expect, test, type Page, type Route } from '@playwright/test';

const fulfill = (route: Route, body: unknown, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});
const handled = async (route: Route, body: unknown, status = 200) => {
  await fulfill(route, body, status);
  return true;
};

const installAuthAndSettings = async (page: Page, additional: (route: Route, url: URL) => Promise<boolean | undefined>) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/me') return fulfill(route, { user: { id: 7, email: 'student@example.invalid', name: 'Student' } });
    if (url.pathname === '/api/settings' && route.request().method() === 'GET') {
      return fulfill(route, { settings: {
        theme_mode: 'light', start_page: 'dashboard', assignment_default_complexity: 'Medium',
        assignment_default_items: 5, confirm_assignment_delete: true,
      } });
    }
    const handled = await additional(route, url);
    if (handled !== undefined) return handled;
    return fulfill(route, { error: `Unhandled test route: ${url.pathname}${url.search}` }, 500);
  });
};

test('Dashboard opens a published plan, completes work, and records plan feedback', async ({ page }) => {
  let toggled = false;
  let feedback = '';
  await installAuthAndSettings(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === '/api/assignments' && method === 'GET') return handled(route, [{
      id: 7, title: 'Calculus midterm', description: '', complexity: 'Hard', due_date: '2099-06-30',
      total_items: 5, total_subtasks: 1, completed_subtasks: 0, plan_generation_status: 'succeeded',
    }]);
    if (url.pathname === '/api/assignment/plan/7') return handled(route, [{
      id: 11, assignment_id: 7, task_description: 'Review derivatives', scheduled_date: '2099-06-20',
      completed: toggled, estimated_minutes: 30,
    }]);
    if (url.pathname === '/api/tasks/11/toggle') {
      expect(route.request().postDataJSON()).toEqual({ completed: true });
      toggled = true;
      return handled(route, { message: 'Task updated', changes: 1 });
    }
    if (url.pathname === '/api/assignments/7/feedback') {
      feedback = route.request().postDataJSON().feedbackType;
      return handled(route, { feedback: { id: crypto.randomUUID(), feedback_type: feedback } }, 201);
    }
    return undefined;
  });

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Continue Plan' }).click();
  const taskText = page.getByText('Review derivatives');
  await expect(taskText).toBeVisible();
  await page.getByRole('button', { name: 'Mark Review derivatives complete' }).click();
  await expect.poll(() => toggled).toBe(true);
  await page.getByRole('button', { name: 'Helpful' }).click();
  await expect(page.getByText('Feedback saved.')).toBeVisible();
  expect(feedback).toBe('helpful');
});

test('Settings exposes planning controls and executes confirmed account deletion', async ({ page }) => {
  let deleted = false;
  await installAuthAndSettings(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === '/api/planning-profile' && method === 'GET') return handled(route, { profile: {
      version: 2, timezone: 'America/Chicago',
      weekday_available_minutes: { 0: 0, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 0 },
      max_daily_minutes: 120, preferred_session_minutes: 45,
    } });
    if (url.pathname === '/api/preference-memories') return handled(route, { memories: [] });
    if (url.pathname === '/api/account' && method === 'DELETE') {
      expect(route.request().postDataJSON()).toEqual({ password: 'student-password' });
      deleted = true;
      return handled(route, { message: 'Account deleted.' });
    }
    return undefined;
  });
  page.on('dialog', async (dialog) => {
    await dialog.accept(dialog.type() === 'prompt' ? 'student-password' : undefined);
  });

  await page.goto('/settings');
  await expect(page.getByLabel('Timezone')).toHaveValue('America/Chicago');
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(page).toHaveURL(/\/$/);
});
