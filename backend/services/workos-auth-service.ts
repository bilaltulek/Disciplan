const crypto = require('crypto');
const { WorkOS } = require('@workos-inc/node');
const db = require('../db');
import type {
  AuthIntent, AuthProvider, PersistedOAuthState, TransactionalDatabase, WorkosConfiguration,
} from '../types.js';

const PROVIDERS: Readonly<Record<AuthProvider, { workosProvider: string; authenticationMethod: string }>> = Object.freeze({
  google: { workosProvider: 'GoogleOAuth', authenticationMethod: 'GoogleOAuth' },
  microsoft: { workosProvider: 'MicrosoftOAuth', authenticationMethod: 'MicrosoftOAuth' },
  sso: { workosProvider: 'authkit', authenticationMethod: 'SSO' },
});
const INTENTS = new Set(['login', 'signup']);
const SAFE_RETURN_PATHS = new Set(['/dashboard', '/timeline', '/history', '/assistant', '/settings', '/profile']);
const STATE_TTL_MS = 10 * 60_000;

const stateHash = (state: any) => crypto.createHash('sha256').update(state).digest('hex');

const safeEqual = (left: any, right: any) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sanitizeReturnPath = (value: any) => (
  typeof value === 'string' && SAFE_RETURN_PATHS.has(value) ? value : '/dashboard'
);

const providerCapabilities = (config: { workos?: WorkosConfiguration }) => {
  const workos = config.workos;
  if (!workos) return { google: false, microsoft: false, sso: false };
  const configured = Boolean(workos.apiKey && workos.clientId && workos.redirectUri && workos.redirectUriValid);
  return {
    google: configured && workos.enabled?.google === true,
    microsoft: configured && workos.enabled?.microsoft === true,
    sso: configured && workos.enabled?.sso === true,
  };
};

const createOAuthState = async (
  { provider, intent, returnPath }: { provider: AuthProvider; intent: AuthIntent; returnPath?: string },
  database: TransactionalDatabase = db,
) => {
  if (!PROVIDERS[provider] || !INTENTS.has(intent)) throw new TypeError('Invalid OAuth state input.');
  const state = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await database.query("DELETE FROM auth_oauth_states WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
  await database.query(
    `INSERT INTO auth_oauth_states (state_hash,provider,intent,return_path,expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [stateHash(state), provider, intent, sanitizeReturnPath(returnPath), expiresAt],
  );
  return state;
};

const consumeOAuthState = async (
  { cookieState, returnedState }: { cookieState?: string; returnedState?: string },
  database: TransactionalDatabase = db,
): Promise<PersistedOAuthState | null> => {
  if (!safeEqual(cookieState, returnedState)) return null;
  const result = await database.query(
    `UPDATE auth_oauth_states SET consumed_at=CURRENT_TIMESTAMP
     WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP
     RETURNING provider,intent,return_path`,
    [stateHash(cookieState)],
  );
  return (result.rows[0] as PersistedOAuthState | undefined) || null;
};

const createWorkosClient = (config: { workos: WorkosConfiguration }) => (
  new WorkOS(config.workos.apiKey, { clientId: config.workos.clientId })
);

const getAuthorizationUrl = ({ config, provider, intent, state, client = createWorkosClient(config) }: any) => {
  const providerConfig = PROVIDERS[provider as AuthProvider];
  if (!providerConfig || !INTENTS.has(intent)) throw new TypeError('Unsupported authentication request.');
  return client.userManagement.getAuthorizationUrl({
    clientId: config.workos.clientId,
    redirectUri: config.workos.redirectUri,
    provider: providerConfig.workosProvider,
    providerScopes: provider === 'google' ? ['openid', 'email', 'profile'] : undefined,
    ...(provider === 'sso' ? { screenHint: intent === 'signup' ? 'sign-up' : 'sign-in' } : {}),
    state,
  });
};

const exchangeAuthorizationCode = async ({ config, code, ipAddress, userAgent, client = createWorkosClient(config) }: any) => (
  client.userManagement.authenticateWithCode({
    clientId: config.workos.clientId,
    code,
    ipAddress,
    userAgent,
  })
);

const authenticationMatchesProvider = (provider: AuthProvider, method: string) => (
  Boolean(PROVIDERS[provider]) && PROVIDERS[provider].authenticationMethod === method
);

const workosDisplayName = (identity: any) => {
  const assembled = [identity.firstName, identity.lastName].filter(Boolean).join(' ').trim();
  const name = (identity.name || assembled || identity.email.split('@')[0] || 'Student').trim();
  return name.slice(0, 100);
};

const resolveWorkosIdentity = async ({ identity, intent }: any, database: any = db) => {
  if (!identity?.id || !identity?.email || identity.emailVerified !== true) {
    return { status: 'unverified' };
  }
  if (!INTENTS.has(intent)) return { status: 'invalid_intent' };

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const byWorkosId = await client.query(
      'SELECT id,email,name FROM users WHERE workos_user_id=$1 FOR UPDATE',
      [identity.id],
    );
    if (byWorkosId.rows[0]) {
      const updated = await client.query(
        `UPDATE users SET email_verified=TRUE,name=COALESCE(name,$2)
         WHERE id=$1 RETURNING id,email,name`,
        [byWorkosId.rows[0].id, workosDisplayName(identity)],
      );
      await client.query('COMMIT');
      return { status: 'authenticated', user: updated.rows[0] };
    }

    const byEmail = await client.query(
      'SELECT id,password,workos_user_id,email_verified FROM users WHERE LOWER(email)=LOWER($1) ORDER BY id LIMIT 2 FOR UPDATE',
      [identity.email.trim()],
    );
    if (byEmail.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'account_link_required' };
    }
    if (intent === 'login') {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }

    const created = await client.query(
      `INSERT INTO users (email,password,name,workos_user_id,email_verified)
       VALUES (LOWER($1),NULL,$2,$3,TRUE)
       ON CONFLICT DO NOTHING RETURNING id,email,name`,
      [identity.email.trim(), workosDisplayName(identity), identity.id],
    );
    if (!created.rows[0]) {
      await client.query('ROLLBACK');
      return { status: 'conflict' };
    }
    await client.query(
      `INSERT INTO user_settings (
         user_id,theme_mode,start_page,assignment_default_complexity,
         assignment_default_items,confirm_assignment_delete
       ) VALUES ($1,'light','dashboard','Medium',5,TRUE)
       ON CONFLICT (user_id) DO NOTHING`,
      [created.rows[0].id],
    );
    await client.query('COMMIT');
    return { status: 'authenticated', user: created.rows[0] };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export = {
  INTENTS,
  PROVIDERS,
  STATE_TTL_MS,
  authenticationMatchesProvider,
  consumeOAuthState,
  createOAuthState,
  exchangeAuthorizationCode,
  getAuthorizationUrl,
  providerCapabilities,
  resolveWorkosIdentity,
  safeEqual,
  sanitizeReturnPath,
  stateHash,
};
