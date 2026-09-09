import { expect, test } from '@playwright/test';

test('public landing page exposes authentication entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /log in/i }).first()).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: /get started/i }).first()).toHaveAttribute('href', '/signup');
});

test('landing paints its stored neutral theme before the React bundle runs', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('disciplan-landing-theme', 'dark'));
  await page.route('**/src/main.jsx', (route) => route.abort());
  await page.goto('/');

  const initialPaint = await page.evaluate(() => ({
    theme: document.documentElement.dataset.landingTheme,
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    root: getComputedStyle(document.getElementById('root')!).backgroundColor,
    bodyImage: getComputedStyle(document.body).backgroundImage,
  }));

  expect(initialPaint).toEqual({
    theme: 'dark',
    html: 'rgb(17, 18, 17)',
    body: 'rgb(17, 18, 17)',
    root: 'rgb(17, 18, 17)',
    bodyImage: 'none',
  });
});

for (const publicPath of ['/login', '/signup', '/terms', '/privacy']) {
  test(`${publicPath} paints its stored neutral theme before React`, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('disciplan-landing-theme', 'dark'));
    await page.route('**/src/main.jsx', (route) => route.abort());
    await page.goto(publicPath);

    expect(await page.evaluate(() => ({
      theme: document.documentElement.dataset.landingTheme,
      html: getComputedStyle(document.documentElement).backgroundColor,
      bodyImage: getComputedStyle(document.body).backgroundImage,
    }))).toEqual({
      theme: 'dark',
      html: 'rgb(17, 18, 17)',
      bodyImage: 'none',
    });
  });
}

test('credential auth pages preserve routes, labels, focus order, and legal links', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/signup');
  await expect(page.getByText(/forgot password/i)).toHaveCount(0);

  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  await expect(page.getByText(/at least 13/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('published legal documents identify the operator and privacy commitments', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByText('Effective September 8, 2026', { exact: true })).toBeVisible();
  await expect(page.getByText(/operated by Bilal Tulek in Texas, United States/i)).toBeVisible();
  await expect(page.getByText(/draft for owner/i)).toHaveCount(0);

  await page.goto('/privacy');
  await expect(page.getByText(/does not sell personal data, use student data for advertising/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:disciplansupport@gmail.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('provider controls follow backend capabilities and preserve safe start routes', async ({ page }) => {
  await page.route('**/api/auth/providers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ google: true, microsoft: true, sso: true }),
  }));
  await page.goto('/login');

  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/api/auth/google/start?intent=login');
  await expect(page.getByRole('link', { name: 'Continue with Microsoft' })).toHaveAttribute('href', '/api/auth/microsoft/start?intent=login');
  await expect(page.getByRole('link', { name: 'Continue with SSO' })).toHaveAttribute('href', '/api/auth/sso/start?intent=login');
  await expect(page.getByText(/github/i)).toHaveCount(0);

  await page.goto('/login?auth_error=email_unverified');
  await expect(page.getByRole('alert')).toContainText('Verify your provider email');
});

test('auth pages remain usable at mobile width and 200% text size', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/signup');
  await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Create account' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.getByRole('link', { name: 'Log in' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const maximumTransitionMs = await page.getByRole('button', { name: 'Create account' }).evaluate((element) => (
    Math.max(...getComputedStyle(element).transitionDuration.split(',').map((duration) => {
      const value = Number.parseFloat(duration);
      return duration.trim().endsWith('ms') ? value : value * 1000;
    }))
  ));
  expect(maximumTransitionMs).toBeLessThanOrEqual(.01);
});

test('product-first landing presents real application sections and local theme control', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('disciplan-landing-theme', 'light'));
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Know what to study next.');
  await expect(page.getByRole('link', { name: 'Product' }).first()).toHaveAttribute('href', '#product');
  await expect(page.getByRole('heading', { name: 'Move through the work day by day.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get help without giving up control.' })).toBeVisible();
  await expect(page.getByText('Assistant-proposed changes publish only after you approve them.')).toBeVisible();
  await expect(page.locator('.product-visual img')).toHaveCount(5);
  await expect(page.locator('video')).toHaveCount(0);

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('.product-landing')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByAltText(/Dashboard showing assignment cards/i)).toHaveAttribute('src', /dashboard-overview-dark-desktop\.webp/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('disciplan-landing-theme'))).toBe('dark');
});

test('mobile landing uses purpose-made product crops and has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('source').first()).toHaveAttribute('srcset', /dashboard-overview-(light|dark)-mobile\.webp/);
  await expect(page.getByRole('heading', { name: 'Turn one assignment into a workable plan.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The same work, from plan to done.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
});

test('landing reflows at 200% text size and honors reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });

  const diagnostics = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.product-button');
    const transitionDuration = button ? getComputedStyle(button).transitionDuration : '';
    const durationMs = transitionDuration.split(',').map((duration) => {
      const value = Number.parseFloat(duration);
      return duration.trim().endsWith('ms') ? value : value * 1000;
    });

    return {
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      maximumTransitionMs: Math.max(0, ...durationMs),
    };
  });

  expect(diagnostics).toEqual({
    hasOverflow: false,
    reducedMotion: true,
    maximumTransitionMs: 0.01,
  });

  for (const selector of ['.product-theme-toggle', '.product-nav-login', '.product-button-small']) {
    const heights = await page.locator(selector).evaluateAll((elements) => (
      elements.map((element) => element.getBoundingClientRect().height)
    ));
    expect(heights.length).toBeGreaterThan(0);
    heights.forEach((height) => expect(height).toBeGreaterThanOrEqual(44));
  }
});
