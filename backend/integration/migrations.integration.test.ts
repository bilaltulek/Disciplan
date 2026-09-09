import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

const require = createRequire(__filename);
const { runMigrations } = require('../scripts/migrate');
const suppliedUrl = resolveSuppliedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const enabled = databaseIntegrationEnabled(process.env);

describe.skipIf(!enabled)('Postgres migration integration', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  let pool: Pool;

  beforeAll(async () => {
    if (suppliedUrl) {
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

  it('migrates a clean database and reruns idempotently', async () => {
    await runMigrations({ client: pool });
    await runMigrations({ client: pool });
    const tables = await pool.query(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE (table_schema = 'public' AND table_name IN ('agent_runs', 'plan_versions', 'agent_approvals'))
          OR (table_schema = 'agent_memory' AND table_name = 'checkpoints')`,
    );
    expect(tables.rows).toHaveLength(4);
    const ledger = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(ledger.rows.at(-1)?.filename).toBe('010_workos_auth.sql');
  }, 120_000);

  it('supports provider-only identities without changing local ownership IDs', async () => {
    await runMigrations({ client: pool });
    const providerUser = await pool.query(
      `INSERT INTO users (email,password,name,workos_user_id,email_verified)
       VALUES ('provider@example.test',NULL,'Provider Student','user_test_provider',TRUE)
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO assignments (user_id,title,complexity,due_date,total_items)
       VALUES ($1,'Provider assignment','Medium','2030-01-10',5)`,
      [providerUser.rows[0].id],
    );

    expect((await pool.query('SELECT user_id FROM assignments WHERE title=$1', ['Provider assignment'])).rows[0].user_id)
      .toBe(providerUser.rows[0].id);
    await expect(pool.query(
      `INSERT INTO users (email,password,name,workos_user_id)
       VALUES ('invalid@example.test',NULL,'Invalid',NULL)`,
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `INSERT INTO users (email,password,name,workos_user_id)
       VALUES ('duplicate@example.test',NULL,'Duplicate','user_test_provider')`,
    )).rejects.toMatchObject({ code: '23505' });
  }, 120_000);
});
