import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

const require = createRequire(__filename);
const { runMigrations } = require('../scripts/migrate.js');
const suppliedUrl = resolveSuppliedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const hasUsableSuppliedUrl = Boolean(suppliedUrl);
const explicitlyTargeted = process.env.RUN_LEGACY_RECONCILIATION === 'true';
const enabled = databaseIntegrationEnabled(process.env) && (!hasUsableSuppliedUrl || explicitlyTargeted);

describe.skipIf(!enabled)('ledgerless prototype reconciliation', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let pool: Pool;

  beforeAll(async () => {
    if (hasUsableSuppliedUrl) {
      pool = new Pool({ connectionString: suppliedUrl });
      return;
    }
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('preserves legacy records and adopts the final migration history', async () => {
    await pool.query(await readFile(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf8'));
    await pool.query(await readFile(path.resolve(__dirname, '../migrations/002_ai_usage_events.sql'), 'utf8'));
    await pool.query(`
      CREATE TABLE plan_generation_runs (
        id UUID PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'reviewing', 'revising', 'succeeded', 'failed', 'cancelled')),
        current_step TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        workflow_run_id TEXT,
        plan_source TEXT,
        failure_code TEXT,
        failure_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, idempotency_key)
      );
      CREATE TABLE plan_generation_run_events (
        id BIGSERIAL PRIMARY KEY,
        run_id UUID NOT NULL REFERENCES plan_generation_runs(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        step TEXT,
        detail TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE ai_budget_reservations (
        id UUID PRIMARY KEY,
        run_id UUID NOT NULL REFERENCES plan_generation_runs(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reserved_total_micro_usd BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        released_at TIMESTAMP,
        used_total_micro_usd BIGINT NOT NULL DEFAULT 0,
        reserved_request_count INTEGER NOT NULL DEFAULT 0,
        used_request_count INTEGER NOT NULL DEFAULT 0,
        finalized_at TIMESTAMP
      );
      ALTER TABLE study_tasks ADD COLUMN generation_run_id UUID REFERENCES plan_generation_runs(id) ON DELETE SET NULL;
      ALTER TABLE study_tasks ADD COLUMN generation_ordinal INTEGER;
      ALTER TABLE ai_usage_events ADD COLUMN generation_run_id UUID REFERENCES plan_generation_runs(id) ON DELETE SET NULL;
      CREATE TABLE workflow_outbox (
        id UUID PRIMARY KEY,
        event_name TEXT NOT NULL,
        payload JSONB NOT NULL,
        dispatched_at TIMESTAMP,
        dispatch_attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dispatch_locked_at TIMESTAMP,
        dispatch_lock_token UUID,
        next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (id, email, password, name)
      VALUES (1, 'preview@example.test', 'not-a-real-password-hash', 'Preview Student');
      INSERT INTO assignments (id, user_id, title, due_date)
      VALUES (1, 1, 'Preserved assignment', CURRENT_DATE + 7);
      INSERT INTO plan_generation_runs (id, assignment_id, user_id, idempotency_key, status)
      VALUES ('11111111-1111-4111-8111-111111111111', 1, 1, 'legacy-key', 'queued');
      INSERT INTO workflow_outbox (id, event_name, payload)
      VALUES (
        '22222222-2222-4222-8222-222222222222',
        'disciplan/plan.requested',
        '{"runId":"11111111-1111-4111-8111-111111111111","assignmentId":1,"userId":1}'::jsonb
      );
    `);

    await runMigrations({ client: pool });

    const ledger = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(ledger.rows.map((row) => row.filename)).toContain('002a_ledgerless_prototype_reconciliation.sql');
    expect(ledger.rows.at(-1)?.filename).toBe('008_plan_feedback.sql');
    const preserved = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) users,
        (SELECT COUNT(*)::int FROM assignments) assignments,
        (SELECT COUNT(*)::int FROM plan_generation_runs) runs,
        (SELECT COUNT(*)::int FROM agent_run_jobs) jobs,
        to_regclass('public.workflow_outbox') workflow_outbox
    `);
    expect(preserved.rows[0]).toMatchObject({
      users: 1,
      assignments: 1,
      runs: 1,
      jobs: 1,
      workflow_outbox: null,
    });
    const job = await pool.query('SELECT payload, completed_at FROM agent_run_jobs');
    expect(job.rows[0].payload.runId).toBe('11111111-1111-4111-8111-111111111111');
    expect(job.rows[0].completed_at).toBeNull();
  }, 120_000);
});
