import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.AUTH_CAPTURE_BASE_URL || 'http://127.0.0.1:5173';
const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../.tmp/auth-review');

const views = [
  { name: 'desktop-light', theme: 'light', width: 1440, height: 1000 },
  { name: 'desktop-dark', theme: 'dark', width: 1440, height: 1000 },
  { name: 'tablet-light', theme: 'light', width: 820, height: 1180 },
  { name: 'mobile-light', theme: 'light', width: 390, height: 844 },
  { name: 'mobile-dark', theme: 'dark', width: 390, height: 844 },
  { name: 'narrow-light', theme: 'light', width: 360, height: 800 },
] as const;

const main = async () => {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const view of views) {
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        colorScheme: view.theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.addInitScript((theme) => window.localStorage.setItem('disciplan-landing-theme', theme), view.theme);

      for (const path of ['/login', '/signup']) {
        await page.goto(`${baseUrl}${path}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: resolve(outputDirectory, `${path.slice(1)}-${view.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        const diagnostics = await page.evaluate(() => ({
          route: window.location.pathname,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          pageHeight: document.documentElement.scrollHeight,
          theme: document.documentElement.dataset.landingTheme,
        }));
        console.log(view.name, diagnostics);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
