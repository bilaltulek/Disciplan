import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(__filename);
const { assertMatchingValidationDatabases, createAgentExecutionPolicy } = require('./agent-execution-policy.js');

describe('development validation execution policy', () => {
  it('keeps global off mode for ordinary users while scoping active and shadow behavior', () => {
    const policy = createAgentExecutionPolicy({
      rolloutMode: 'off', validationMode: 'development', dataEnvironment: 'isolated-preview',
      vercelEnvironment: 'preview', activeUserIds: '11', shadowUserIds: '12',
    });
    expect(policy.effectiveModeForUser(10)).toBe('off');
    expect(policy.effectiveModeForUser(11)).toBe('active');
    expect(policy.effectiveModeForUser(12)).toBe('shadow');
    expect(policy.canDispatchUser(10)).toBe(false);
    expect(policy.canDispatchUser(11)).toBe(true);
  });

  it('rejects every unsafe validation configuration', () => {
    const base = {
      rolloutMode: 'off', validationMode: 'development', dataEnvironment: 'isolated-preview',
      vercelEnvironment: 'preview', activeUserIds: '11', shadowUserIds: '12',
    };
    expect(() => createAgentExecutionPolicy({ ...base, rolloutMode: 'active' })).toThrow(/ROLLOUT_MODE=off/);
    expect(() => createAgentExecutionPolicy({ ...base, dataEnvironment: 'production' })).toThrow(/isolated-preview/);
    expect(() => createAgentExecutionPolicy({ ...base, vercelEnvironment: 'production' })).toThrow(/Vercel Preview/);
    expect(() => createAgentExecutionPolicy({ ...base, activeUserIds: '' })).toThrow(/nonempty/);
    expect(() => createAgentExecutionPolicy({ ...base, shadowUserIds: '11' })).toThrow(/disjoint/);
    expect(() => createAgentExecutionPolicy({ ...base, activeUserIds: 'not-an-id' })).toThrow(/positive integer/);
  });

  it('rejects dormant validation variables when validation mode is disabled', () => {
    expect(() => createAgentExecutionPolicy({
      rolloutMode: 'off', validationMode: 'disabled', activeUserIds: '11',
    })).toThrow(/require AGENT_VALIDATION_MODE=development/);
  });

  it('requires the pooled and direct URLs to identify the same isolated Neon database', () => {
    const policy = createAgentExecutionPolicy({
      rolloutMode: 'off', validationMode: 'development', dataEnvironment: 'isolated-preview',
      activeUserIds: '11', shadowUserIds: '12',
    });
    expect(() => assertMatchingValidationDatabases({
      policy,
      databaseUrl: 'postgresql://app@ep-preview-pooler.example.neon.tech/disciplan',
      agentDatabaseUrl: 'postgresql://worker@ep-preview.example.neon.tech/disciplan',
    })).not.toThrow();
    expect(() => assertMatchingValidationDatabases({
      policy,
      databaseUrl: 'postgresql://app@ep-production-pooler.example.neon.tech/disciplan',
      agentDatabaseUrl: 'postgresql://worker@ep-preview.example.neon.tech/disciplan',
    })).toThrow(/same isolated Neon database/);
    expect(() => assertMatchingValidationDatabases({
      policy,
      databaseUrl: 'postgresql://app@ep-preview.example.neon.tech/disciplan',
      agentDatabaseUrl: 'postgresql://worker@ep-preview-pooler.example.neon.tech/disciplan',
    })).toThrow(/same isolated Neon database/);
  });
});
