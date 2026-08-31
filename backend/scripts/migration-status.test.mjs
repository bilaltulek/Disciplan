import { describe, expect, it } from 'vitest';
import migrationStatus from './migration-status.js';

const { MIGRATION_REQUIREMENTS, classifyMigrationState } = migrationStatus;

describe('migration status classification', () => {
  it('reports complete, partial, and missing migrations without database writes', () => {
    const available = new Set([
      ...MIGRATION_REQUIREMENTS['001_init.sql'],
      ...MIGRATION_REQUIREMENTS['002_ai_usage_events.sql'],
      MIGRATION_REQUIREMENTS['003_agent_runs.sql'][0],
    ]);

    const report = classifyMigrationState(available);

    expect(report['001_init.sql'].state).toBe('complete');
    expect(report['002_ai_usage_events.sql'].state).toBe('complete');
    expect(report['003_agent_runs.sql'].state).toBe('partial');
    expect(report['004_agent_job_durability.sql'].state).toBe('missing');
  });
});
