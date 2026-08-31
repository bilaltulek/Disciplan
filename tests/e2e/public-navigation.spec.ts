import { expect, test } from '@playwright/test';

test('public landing page exposes authentication entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /log in/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /sign up|get started/i }).first()).toBeVisible();
});
