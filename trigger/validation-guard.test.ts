import { describe, expect, it, vi } from 'vitest';
import { assertDevelopmentValidationEnvironment, assertRunAllowed } from './validation-guard.js';

const config = (overrides = {}) => ({
  agentRolloutMode: 'off' as const,
  agentExecutionPolicy: {
    validationMode: 'development' as const,
    dataEnvironment: 'isolated-preview',
    canDispatchUser: (userId: number) => userId === 42,
  },
  ...overrides,
});

describe('Trigger Development validation guard', () => {
  it('accepts only the Development task environment', () => {
    expect(() => assertDevelopmentValidationEnvironment(config(), {
      environment: { type: 'DEVELOPMENT' },
    })).not.toThrow();
    expect(() => assertDevelopmentValidationEnvironment(config(), {
      environment: { type: 'PREVIEW' },
    })).toThrow(/guard rejected/);
  });

  it('rejects non-allowlisted and missing runs while rollout remains off', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 7 }] });
    const database = { query };
    await expect(assertRunAllowed(database, config(), 'allowed')).resolves.toBeUndefined();
    await expect(assertRunAllowed(database, config(), 'denied')).rejects.toMatchObject({
      code: 'VALIDATION_RUN_NOT_ALLOWED',
    });
  });

  it('accepts only the managed Production environment of the preview-only project', () => {
    const previewConfig = config({
      agentRolloutMode: 'active', agentRuntimeScope: 'preview', triggerProjectRef: 'proj_preview',
    });
    expect(() => assertDevelopmentValidationEnvironment(previewConfig, {
      environment: { type: 'PRODUCTION' }, project: { ref: 'proj_preview' },
    })).not.toThrow();
    expect(() => assertDevelopmentValidationEnvironment(previewConfig, {
      environment: { type: 'PRODUCTION' }, project: { ref: 'proj_wrong' },
    })).toThrowError(expect.objectContaining({ code: 'PREVIEW_ENVIRONMENT_REJECTED' }));
  });
});
