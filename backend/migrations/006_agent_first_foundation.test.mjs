import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'backend/migrations/006_agent_first_foundation.sql'),
  'utf8',
);

describe('006 agent-first foundation migration', () => {
  it.each([
    'agent_threads',
    'agent_messages',
    'agent_runs',
    'agent_run_events',
    'agent_dispatch_outbox',
    'plan_versions',
    'plan_version_items',
    'agent_approvals',
    'user_planning_profiles',
  ])('creates %s additively', (table) => {
    expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  });

  it('keeps legacy prototype tables available during cutover', () => {
    expect(migration).not.toMatch(/DROP TABLE/i);
    expect(migration).not.toMatch(/ALTER TABLE\s+plan_generation_runs/i);
    expect(migration).not.toMatch(/ALTER TABLE\s+agent_run_jobs/i);
  });

  it('enforces one published version per assignment', () => {
    expect(migration).toContain('idx_plan_versions_one_published');
    expect(migration).toContain("WHERE status = 'published'");
  });

  it('uses an outbox uniqueness boundary per run, task type, and resume dispatch', () => {
    expect(migration).toContain('UNIQUE (run_id, task_type, dispatch_key)');
  });
});
