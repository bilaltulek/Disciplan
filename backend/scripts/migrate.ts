const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../migration-db');
const {
  MIGRATION_REQUIREMENTS,
  classifyMigrationState,
} = require('./migration-status');

const migrationsDir = path.resolve(__dirname, '../migrations');

const checksum = (sql: any) => crypto.createHash('sha256').update(sql).digest('hex');

async function readAvailableObjects(client: any) {
  const [tables, columns] = await Promise.all([
    client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'agent_memory')"),
    client.query("SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN ('public', 'agent_memory')"),
  ]);
  return new Set([
    ...tables.rows.map((row: any) => `table:${row.table_schema === 'public' ? '' : `${row.table_schema}.`}${row.table_name}`),
    ...columns.rows.map((row: any) => `column:${row.table_schema === 'public' ? '' : `${row.table_schema}.`}${row.table_name}.${row.column_name}`),
  ]);
}

async function ensureLedger(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runMigrations({ client: suppliedClient, directory = migrationsDir }: any = {}) {
  const files = fs.readdirSync(directory)
    .filter((name: any) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = suppliedClient || await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('disciplan-schema-migrations'))");
    await ensureLedger(client);
    const appliedResult = await client.query('SELECT filename, checksum FROM schema_migrations');
    const applied = new Map(appliedResult.rows.map((row: any) => [row.filename, row.checksum]));

    for (const file of files) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const digest = checksum(sql);
      if (applied.has(file)) {
        if (applied.get(file) !== digest) {
          throw new Error(`Applied migration was modified: ${file}`);
        }
        console.log(`Already applied: ${file}`);
        continue;
      }

      const requirements = MIGRATION_REQUIREMENTS[file];
      if (requirements) {
        const states = classifyMigrationState(await readAvailableObjects(client));
        if (states[file].state === 'partial') {
          throw new Error(`Partial migration state detected for ${file}; use an additive corrective migration.`);
        }
        if (states[file].state === 'complete') {
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
            [file, digest],
          );
          console.log(`Recorded existing migration: ${file}`);
          continue;
        }
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, digest],
        );
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    if (!suppliedClient) process.exitCode = 1;
    else throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('disciplan-schema-migrations'))");
    } finally {
      if (!suppliedClient) {
        client.release();
        await db.end();
      }
    }
  }
}

if (require.main === module) runMigrations();

export = {
  checksum,
  runMigrations,
};
