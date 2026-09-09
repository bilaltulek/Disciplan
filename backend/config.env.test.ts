import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runConfigProbe = (expression: string, overrides: Record<string, string> = {}) => spawnSync(
  process.execPath,
  ['--require', 'tsx/cjs', '-e', `const config = require('./backend/config.env'); ${expression}`],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENT_ROLLOUT_MODE: 'active',
      AGENT_VALIDATION_MODE: 'disabled',
      AGENT_VALIDATION_ACTIVE_USER_IDS: '',
      AGENT_VALIDATION_SHADOW_USER_IDS: '',
      AGENT_VALIDATION_FAULTS_ENABLED: 'false',
      DISCIPLAN_DATA_ENV: '',
      AGENT_RUNTIME_SCOPE: 'standard',
      TRIGGER_PROJECT_REF: '',
      VERCEL_ENV: '',
      DATABASE_URL: 'postgresql://example.invalid/disciplan',
      AGENT_DATABASE_URL: '',
      JWT_SECRET: '',
      GEMINI_API_KEY: '',
      ...overrides,
    },
  },
);

describe('runtime-scoped configuration secrets', () => {
  it('loads shared production configuration without eagerly requiring API or model secrets', () => {
    const result = runConfigProbe("process.stdout.write(config.agentRolloutMode);");

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/active$/);
    expect(result.stderr).toBe('');
  });

  it('fails closed when the API runtime accesses a missing JWT secret', () => {
    const result = runConfigProbe('void config.jwtSecret;');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing required environment variable: JWT_SECRET');
  });

  it('fails closed when an active agent runtime accesses a missing Gemini key', () => {
    const result = runConfigProbe('void config.geminiApiKey;');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing required environment variable: GEMINI_API_KEY');
  });

  it('loads development validation only for isolated Vercel Preview with disjoint owners', () => {
    const result = runConfigProbe(
      "process.stdout.write([config.agentExecutionPolicy.effectiveModeForUser(41), config.agentExecutionPolicy.effectiveModeForUser(42), config.agentExecutionPolicy.effectiveModeForUser(43)].join(','));",
      {
        AGENT_ROLLOUT_MODE: 'off', AGENT_VALIDATION_MODE: 'development',
        DISCIPLAN_DATA_ENV: 'isolated-preview', VERCEL_ENV: 'preview',
        AGENT_VALIDATION_ACTIVE_USER_IDS: '42', AGENT_VALIDATION_SHADOW_USER_IDS: '43',
        DATABASE_URL: 'postgresql://app@ep-preview-pooler.example.neon.tech/disciplan',
        AGENT_DATABASE_URL: 'postgresql://worker@ep-preview.example.neon.tech/disciplan',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/off,active,shadow$/);
  });

  it('rejects development validation in a production Vercel environment', () => {
    const result = runConfigProbe('void config.agentExecutionPolicy;', {
      AGENT_ROLLOUT_MODE: 'off', AGENT_VALIDATION_MODE: 'development',
      DISCIPLAN_DATA_ENV: 'isolated-preview', VERCEL_ENV: 'production',
      AGENT_VALIDATION_ACTIVE_USER_IDS: '42', AGENT_VALIDATION_SHADOW_USER_IDS: '43',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Development validation may run only in Vercel Preview');
  });

  it('accepts an active isolated Preview runtime with matching pooled and direct databases', () => {
    const result = runConfigProbe(
      "process.stdout.write([config.agentRuntimeScope, config.triggerProjectRef].join(','));",
      {
        AGENT_RUNTIME_SCOPE: 'preview', AGENT_ROLLOUT_MODE: 'active',
        DISCIPLAN_DATA_ENV: 'isolated-preview', VERCEL_ENV: 'preview',
        DATABASE_URL: 'postgresql://app@ep-preview-pooler.example.neon.tech/disciplan',
        AGENT_DATABASE_URL: 'postgresql://worker@ep-preview.example.neon.tech/disciplan',
        TRIGGER_PROJECT_REF: 'proj_previewonly',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/preview,proj_previewonly$/);
  });

  it('rejects Preview runtime scope in Vercel Production', () => {
    const result = runConfigProbe('void config.agentRuntimeScope;', {
      AGENT_RUNTIME_SCOPE: 'preview', AGENT_ROLLOUT_MODE: 'active',
      DISCIPLAN_DATA_ENV: 'isolated-preview', VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://app@ep-preview-pooler.example.neon.tech/disciplan',
      AGENT_DATABASE_URL: 'postgresql://worker@ep-preview.example.neon.tech/disciplan',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('may run only in Vercel Preview');
  });

  it('keeps WorkOS providers disabled unless credentials, callback, and flags are complete', () => {
    const disabled = runConfigProbe("process.stdout.write('WORKOS_CONFIG:' + JSON.stringify(config.workos));", {
      AGENT_ROLLOUT_MODE: 'off',
      WORKOS_API_KEY: '', WORKOS_CLIENT_ID: '', WORKOS_REDIRECT_URI: '',
      AUTH_GOOGLE_ENABLED: 'true',
    });
    expect(disabled.status).toBe(0);
    expect(JSON.parse(disabled.stdout.match(/WORKOS_CONFIG:(\{.*\})$/s)?.[1] || '{}'))
      .toMatchObject({ redirectUriValid: false, enabled: { google: true } });

    const configured = runConfigProbe("process.stdout.write('WORKOS_CONFIG:' + JSON.stringify(config.workos));", {
      AGENT_ROLLOUT_MODE: 'off',
      WORKOS_API_KEY: 'sk_test_example', WORKOS_CLIENT_ID: 'client_example',
      WORKOS_REDIRECT_URI: 'https://preview.example.test/api/auth/callback',
      AUTH_MICROSOFT_ENABLED: 'true',
    });
    expect(configured.status).toBe(0);
    expect(JSON.parse(configured.stdout.match(/WORKOS_CONFIG:(\{.*\})$/s)?.[1] || '{}'))
      .toMatchObject({ redirectUriValid: true, enabled: { microsoft: true } });
  });
});
