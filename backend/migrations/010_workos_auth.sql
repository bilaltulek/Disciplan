-- Optional WorkOS identities preserve local user IDs and existing ownership.
ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS workos_user_id TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS users_workos_user_id_unique
  ON users (workos_user_id)
  WHERE workos_user_id IS NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_has_authentication_method,
  ADD CONSTRAINT users_has_authentication_method
    CHECK (password IS NOT NULL OR workos_user_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'sso')),
  intent TEXT NOT NULL CHECK (intent IN ('login', 'signup')),
  return_path TEXT NOT NULL DEFAULT '/dashboard',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS auth_oauth_states_expiry_idx
  ON auth_oauth_states (expires_at);

-- Rollback safety: before restoring users.password NOT NULL, first prove that
-- no provider-only row exists. Never synthesize or coerce a missing password.
