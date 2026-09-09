import { describe, expect, it } from 'vitest';

const { getTriggerClientConfiguration } = require('./trigger-client-config');

describe('Trigger API client configuration', () => {
  it('suppresses Vercel branch routing only for the isolated Preview API', () => {
    expect(getTriggerClientConfiguration({
      AGENT_RUNTIME_SCOPE: 'preview',
      DISCIPLAN_EXECUTION_RUNTIME: 'api',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'feature-branch',
      TRIGGER_SECRET_KEY: 'test-secret',
    })).toEqual({ accessToken: 'test-secret', previewBranch: '' });
  });

  it('does not override Trigger routing in production or task workers', () => {
    expect(getTriggerClientConfiguration({
      AGENT_RUNTIME_SCOPE: 'production', DISCIPLAN_EXECUTION_RUNTIME: 'api', VERCEL_ENV: 'production',
      TRIGGER_SECRET_KEY: 'test-secret',
    })).toBeNull();
    expect(getTriggerClientConfiguration({
      AGENT_RUNTIME_SCOPE: 'preview', DISCIPLAN_EXECUTION_RUNTIME: 'trigger', VERCEL_ENV: 'preview',
      TRIGGER_SECRET_KEY: 'test-secret',
    })).toBeNull();
  });
});
