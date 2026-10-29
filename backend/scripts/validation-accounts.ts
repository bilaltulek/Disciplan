const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const ROLES = Object.freeze({
  control: 'disciplan-validation-control@example.invalid',
  shadow: 'disciplan-validation-shadow@example.invalid',
  active: 'disciplan-validation-active@example.invalid',
});

const requireIsolatedDatabase = () => {
  if (process.env.DISCIPLAN_DATA_ENV !== 'isolated-preview') {
    throw new Error('Validation accounts require DISCIPLAN_DATA_ENV=isolated-preview.');
  }
  if (process.env.AGENT_ROLLOUT_MODE !== 'off') {
    throw new Error('Validation accounts require AGENT_ROLLOUT_MODE=off.');
  }
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required.');
  }
  return connectionString;
};

const createAccounts = async (client: any) => {
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const results = [];
  for (const [role, email] of Object.entries(ROLES)) {
    const existing = await client.query('SELECT id,email,name FROM users WHERE email=$1', [email]);
    let user = existing.rows[0];
    if (!user) {
      const inserted = await client.query(
        'INSERT INTO users (email,password,name) VALUES ($1,$2,$3) RETURNING id,email,name',
        [email, passwordHash, `Validation ${role}`],
      );
      user = inserted.rows[0];
    }
    await client.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    );
    results.push({ role, userId: Number(user.id) });
  }
  return results;
};

const deleteAccounts = async (client: any) => {
  const result = await client.query(
    'DELETE FROM users WHERE email = ANY($1::text[]) RETURNING id',
    [Object.values(ROLES)],
  );
  return result.rowCount;
};

const deleteAccountCheckpoints = async (client: any) => {
  let deleted = 0;
  for (const table of ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints']) {
    const result = await client.query(
      `DELETE FROM agent_memory.${table} checkpoint
       USING agent_runs run, users validation_user
       WHERE run.user_id = validation_user.id
         AND validation_user.email = ANY($1::text[])
         AND checkpoint.thread_id IN (
           run.id::text,
           run.id::text || ':planner',
           run.id::text || ':reviewer'
         )`,
      [Object.values(ROLES)],
    );
    deleted += result.rowCount;
  }
  return deleted;
};

const main = async () => {
  const action = process.argv[2];
  if (!['create', 'delete'].includes(action)) {
    throw new Error('Usage: tsx backend/scripts/validation-accounts.ts <create|delete>');
  }
  const pool = new Pool({ connectionString: requireIsolatedDatabase(), ssl: { rejectUnauthorized: true } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (action === 'create') {
      const accounts = await createAccounts(client);
      await client.query('COMMIT');
      process.stdout.write(`${JSON.stringify({ created: true, accounts })}\n`);
    } else {
      const checkpointRows = await deleteAccountCheckpoints(client);
      const deleted = await deleteAccounts(client);
      await client.query('COMMIT');
      process.stdout.write(`${JSON.stringify({ deleted, checkpointRows })}\n`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  main().catch((error: any) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export = {
  ROLES, createAccounts, deleteAccountCheckpoints, deleteAccounts, requireIsolatedDatabase,
};
