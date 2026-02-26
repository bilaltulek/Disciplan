const fs = require('fs');
const path = require('path');
const db = require('../db');

const migrationsDir = path.resolve(__dirname, '../migrations');

async function runMigrations() {
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = await db.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
}

runMigrations();
