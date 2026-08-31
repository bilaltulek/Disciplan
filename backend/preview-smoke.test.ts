import { describe, expect, it, vi } from 'vitest';
import { runPreviewSmoke } from '../trigger/preview-smoke.js';

describe('preview smoke task handler', () => {
  it('checks connectivity and returns only sanitized readiness state', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ database_url: 'must-not-escape', student_content: 'must-not-escape' }],
    });

    const result = await runPreviewSmoke(
      { query },
      {
        agentRolloutMode: 'off', geminiApiKey: 'configured-but-secret',
        agentExecutionPolicy: { validationMode: 'development', dataEnvironment: 'isolated-preview' },
      },
      'DEVELOPMENT',
    );

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result).toEqual({
      databaseReady: true,
      geminiConfigured: true,
      rolloutMode: 'off',
      developmentEnvironment: true,
      managedPreviewRuntime: false,
      isolatedDataEnvironment: true,
    });
    expect(JSON.stringify(result)).not.toContain('must-not-escape');
    expect(JSON.stringify(result)).not.toContain('configured-but-secret');
  });
});
