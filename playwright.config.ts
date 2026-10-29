import { defineConfig, devices } from '@playwright/test';

const e2eServerEnvironment = {
  ...process.env,
  AGENT_VALIDATION_MODE: 'disabled',
  AGENT_VALIDATION_ACTIVE_USER_IDS: ' ',
  AGENT_VALIDATION_SHADOW_USER_IDS: ' ',
  AGENT_VALIDATION_FAULTS_ENABLED: 'false',
  DISCIPLAN_DATA_ENV: ' ',
  VERCEL_ENV: ' ',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL ? undefined : [
    {
      command: 'npm run start:backend',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: !process.env.CI,
      env: e2eServerEnvironment,
    },
    { command: 'npm --prefix frontend run dev -- --host 127.0.0.1', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
  ],
});
