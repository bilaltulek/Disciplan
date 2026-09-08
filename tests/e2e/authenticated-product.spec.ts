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

test('authenticated shell exposes responsive navigation and active-page context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthAndSettings(page, async (route, url) => {
    if (url.pathname === '/api/assignments' && route.request().method() === 'GET') {
      return handled(route, []);
    }
    return undefined;
  });

  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveClass(/app-ui/);
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  for (const name of ['Assistant', 'Dashboard', 'Timeline', 'History']) {
    const height = await page.getByRole('link', { name }).evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

test('Dashboard creates an assignment and preserves semantic filtering controls', async ({ page }) => {
  let created = false;
  await installAuthAndSettings(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === '/api/assignments' && method === 'GET') {
      return handled(route, created ? [{
        id: 14,
        title: 'Operating Systems lab',
        description: 'Implement process control exercises.',
        complexity: 'Hard',
        due_date: '2099-09-30',
        total_items: 6,
        total_subtasks: 0,
        completed_subtasks: 0,
        plan_generation_status: 'queued',
      }] : []);
    }
    if (url.pathname === '/api/assignments' && method === 'POST') {
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      expect(route.request().postDataJSON()).toEqual({
        title: 'Operating Systems lab',
        description: 'Implement process control exercises.',
        complexity: 'Hard',
        dueDate: '2099-09-30',
        totalItems: 6,
      });
      created = true;
      return handled(route, {
        queued: true,
        assignment: { id: 14 },
        run: { id: 'run-14' },
      }, 202);
    }
    return undefined;
  });

  await page.goto('/dashboard');
  const addAssignment = page.getByRole('button', { name: 'Add New Assignment' });
  expect(await addAssignment.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await addAssignment.click();
  await page.getByLabel('Title').fill('Operating Systems lab');
  await page.getByLabel('Due Date').fill('2099-09-30');
  await page.getByLabel('Workload').fill('6');
  await page.getByLabel('Difficulty').selectOption('Hard');
  await page.getByLabel('Description').fill('Implement process control exercises.');
  await page.getByRole('button', { name: 'Create Plan' }).click();

  await expect.poll(() => created).toBe(true);
  await expect(page.getByRole('heading', { name: 'Operating Systems lab' })).toBeVisible();
  const hardFilter = page.getByRole('button', { name: 'Hard', exact: true });
  await hardFilter.click();
  await expect(hardFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.difficulty-hard')).toHaveText('Hard');
});

test('History filters, edits, and deletes completed work without changing its behavior', async ({ page }) => {
  let deleted = false;
  let task = {
    id: 41,
    assignment_id: 14,
    task_description: 'Trace process creation calls',
    assignment_title: 'Operating Systems lab',
    complexity: 'Hard',
    scheduled_date: '2026-09-07',
    completed_at: new Date().toISOString(),
    estimated_minutes: 45,
    actual_minutes: 50,
    completed: true,
  };
  await installAuthAndSettings(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === '/api/history' && method === 'GET') return handled(route, deleted ? [] : [task]);
    if (url.pathname === '/api/tasks/41' && method === 'PATCH') {
      expect(route.request().postDataJSON()).toMatchObject({
        task_description: 'Trace fork and waitpid calls',
        actual_minutes: 55,
        completed: true,
      });
      task = { ...task, task_description: 'Trace fork and waitpid calls', actual_minutes: 55 };
      return handled(route, { message: 'Task updated' });
    }
    if (url.pathname === '/api/tasks/41' && method === 'DELETE') {
      deleted = true;
      return handled(route, { message: 'Task deleted' });
    }
    return undefined;
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Trace process creation calls' })).toBeVisible();
  const hardFilter = page.getByRole('button', { name: 'Hard', exact: true });
  await hardFilter.click();
  await expect(hardFilter).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Search completed tasks').fill('Operating Systems');

  await page.getByRole('button', { name: 'Edit completed task' }).click();
  await page.getByLabel('Task Description').fill('Trace fork and waitpid calls');
  await page.getByLabel('Actual').fill('55');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Trace fork and waitpid calls' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete completed task' }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(page.getByText('No completed tasks match your filters.')).toBeVisible();
});

test('Timeline navigates days and preserves task edit, completion, deletion, and filtering flows', async ({ page }) => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];
  let tasks = [
    { id: 50, assignment_id: 14, task_description: 'Read process notes', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: today, estimated_minutes: 40, completed: false },
    { id: 51, assignment_id: 14, task_description: 'Trace process calls', assignment_title: 'Operating Systems lab', complexity: 'Hard', scheduled_date: tomorrow, estimated_minutes: 45, completed: false },
    { id: 52, assignment_id: 15, task_description: 'Review derivative rules', assignment_title: 'Calculus midterm', complexity: 'Medium', scheduled_date: tomorrow, estimated_minutes: 30, completed: false },
  ];
  await installAuthAndSettings(page, async (route, url) => {
    const method = route.request().method();
    if (url.pathname === '/api/timeline' && method === 'GET') return handled(route, tasks);
    if (url.pathname === '/api/tasks/51' && method === 'PATCH') {
      expect(route.request().postDataJSON()).toMatchObject({ task_description: 'Trace fork and exec calls', estimated_minutes: 50, completed: false });
      tasks = tasks.map((task) => task.id === 51 ? { ...task, task_description: 'Trace fork and exec calls', estimated_minutes: 50 } : task);
      return handled(route, { message: 'Task updated' });
    }
    if (url.pathname === '/api/tasks/51/toggle' && method === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ completed: true });
      tasks = tasks.map((task) => task.id === 51 ? { ...task, completed: true } : task);
      return handled(route, { message: 'Task updated' });
    }
    if (url.pathname === '/api/tasks/52' && method === 'DELETE') {
      tasks = tasks.filter((task) => task.id !== 52);
      return handled(route, { message: 'Task deleted' });
    }
    return undefined;
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/timeline');
  await expect(page.getByRole('heading', { name: /Today/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next Day' }).click();
  await expect(page.getByText('Trace process calls')).toBeVisible();

  await page.getByRole('button', { name: 'Edit task' }).first().click();
  await page.getByLabel('Task Description').fill('Trace fork and exec calls');
  await page.getByLabel('Minutes').fill('50');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Trace fork and exec calls')).toBeVisible();

  await page.getByRole('button', { name: 'Delete task' }).last().click();
  await expect(page.getByText('Review derivative rules')).toBeHidden();
  await page.getByRole('checkbox', { name: 'Mark task complete' }).check();
  await expect(page.getByRole('checkbox', { name: 'Mark task incomplete' })).toBeChecked();
  const hideCompleted = page.getByRole('button', { name: 'Hide Completed' });
  await hideCompleted.click();
  await expect(page.getByRole('button', { name: 'Showing Incomplete Only' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Trace fork and exec calls')).toBeHidden();
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
