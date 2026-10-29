import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'backend/migrations/010_workos_auth.sql'), 'utf8');

describe('WorkOS identity migration', () => {
  it('keeps local users while permitting provider-only identities', () => {
    expect(migration).toContain('ALTER COLUMN password DROP NOT NULL');
    expect(migration).toContain('workos_user_id TEXT');
    expect(migration).toContain('email_verified BOOLEAN NOT NULL DEFAULT FALSE');
    expect(migration).toContain('password IS NOT NULL OR workos_user_id IS NOT NULL');
    expect(migration).toContain('users_workos_user_id_unique');
  });

  it('persists only hashed, expiring, one-time OAuth state', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS auth_oauth_states');
    expect(migration).toContain('state_hash TEXT PRIMARY KEY');
    expect(migration).toContain('consumed_at TIMESTAMPTZ');
    expect(migration).not.toContain('access_token');
    expect(migration).not.toContain('refresh_token');
  });
});
