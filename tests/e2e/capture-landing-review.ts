import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.LANDING_CAPTURE_BASE_URL || 'http://127.0.0.1:5173';
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../.tmp/landing-final');

const views = [
  { name: 'light-desktop-1440', theme: 'light', width: 1440, height: 1000 },
  { name: 'dark-desktop-1440', theme: 'dark', width: 1440, height: 1000 },
  { name: 'light-wide-1920', theme: 'light', width: 1920, height: 1080 },
  { name: 'light-tablet-820', theme: 'light', width: 820, height: 1180 },
  { name: 'light-mobile-390', theme: 'light', width: 390, height: 844 },
  { name: 'dark-mobile-390', theme: 'dark', width: 390, height: 844 },
  { name: 'light-narrow-360', theme: 'light', width: 360, height: 800 },
] as const;

const preparePage = async (page: Page, theme: 'light' | 'dark') => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthenticated capture.' }) });
  });
  await page.addInitScript((initialTheme) => window.localStorage.setItem('disciplan-landing-theme', initialTheme), theme);
  await page.goto(`${BASE_URL}/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < pageHeight; y += Math.max(320, Math.round(page.viewportSize()!.height * .7))) {
    await page.evaluate((offset) => window.scrollTo(0, offset), y);
    await page.waitForTimeout(45);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.waitForTimeout(120);
};

const main = async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const view of views) {
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        colorScheme: view.theme,
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await preparePage(page, view.theme);
      await page.screenshot({ path: resolve(OUTPUT_DIR, `${view.name}.png`), fullPage: true, animations: 'disabled' });
      const diagnostics = await page.evaluate(() => ({
        width: window.innerWidth,
        pageHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        sections: Array.from(document.querySelectorAll('main > section')).map((section) => ({
          id: section.id || section.className.split(' ')[0],
          height: Math.round(section.getBoundingClientRect().height),
        })),
      }));
      console.log(view.name, diagnostics);
      await context.close();
    }

    for (const comparison of [
      { name: 'comes-next', text: 'Know what comes next.' },
      { name: 'study-next', text: 'Know what to study next.' },
    ]) {
      for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, colorScheme: 'light', reducedMotion: 'reduce' });
        const page = await context.newPage();
        await preparePage(page, 'light');
        await page.getByRole('heading', { level: 1 }).evaluate((heading, text) => { heading.textContent = text; }, comparison.text);
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `hero-${comparison.name}-${viewport.name}.png`),
          animations: 'disabled',
          clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, 760) },
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
