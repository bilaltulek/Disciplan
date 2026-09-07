import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

const require = createRequire(__filename);
const { runMigrations } = require('../scripts/migrate.js');
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
    expect(ledger.rows.at(-1)?.filename).toBe('009_conversation_context.sql');
  }, 120_000);
});
