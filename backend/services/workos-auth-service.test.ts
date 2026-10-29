import { describe, expect, it, vi } from 'vitest';

const {
  authenticationMatchesProvider,
  consumeOAuthState,
  createOAuthState,
  getAuthorizationUrl,
  providerCapabilities,
  resolveWorkosIdentity,
  sanitizeReturnPath,
  stateHash,
} = require('./workos-auth-service');

describe('WorkOS authentication service', () => {
  it('reports only fully configured and individually enabled providers', () => {
    const base = {
      workos: {
        apiKey: 'secret', clientId: 'client', redirectUri: 'https://example.test/api/auth/callback',
        redirectUriValid: true, enabled: { google: true, microsoft: false, sso: true },
      },
    };
    expect(providerCapabilities(base)).toEqual({ google: true, microsoft: false, sso: true });
    expect(providerCapabilities({ workos: { ...base.workos, apiKey: '' } })).toEqual({ google: false, microsoft: false, sso: false });
  });

  it('allowlists local return paths', () => {
    expect(sanitizeReturnPath('/assistant')).toBe('/assistant');
    expect(sanitizeReturnPath('//attacker.test')).toBe('/dashboard');
    expect(sanitizeReturnPath('https://attacker.test')).toBe('/dashboard');
  });

  it('stores only a hash and consumes matching state once', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ provider: 'google', intent: 'login', return_path: '/dashboard' }] })
      .mockResolvedValueOnce({ rows: [] });
    const state = await createOAuthState({ provider: 'google', intent: 'login', returnPath: '//bad' }, { query });
    expect(state).toHaveLength(43);
    expect(query.mock.calls[1][1][0]).toBe(stateHash(state));
    expect(query.mock.calls[1][1]).not.toContain(state);
    expect(query.mock.calls[1][1][3]).toBe('/dashboard');
    await expect(consumeOAuthState({ cookieState: state, returnedState: state }, { query })).resolves.toMatchObject({ provider: 'google' });
    await expect(consumeOAuthState({ cookieState: state, returnedState: state }, { query })).resolves.toBeNull();
    await expect(consumeOAuthState({ cookieState: state, returnedState: 'different' }, { query })).resolves.toBeNull();
    expect(query.mock.calls[2][0]).toContain('consumed_at IS NULL');
    expect(query.mock.calls[2][0]).toContain('expires_at>CURRENT_TIMESTAMP');
  });

  it('requests the exact social provider and minimal Google scopes', () => {
    const getUrl = vi.fn().mockReturnValue('https://example.workos.com/authorize');
    const client = { userManagement: { getAuthorizationUrl: getUrl } };
    const config = { workos: { clientId: 'client', redirectUri: 'https://app.test/api/auth/callback' } };
    expect(getAuthorizationUrl({ config, provider: 'google', intent: 'signup', state: 'state', client })).toContain('workos.com');
    expect(getUrl).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'GoogleOAuth', providerScopes: ['openid', 'email', 'profile'], state: 'state',
    }));
    expect(getUrl.mock.calls[0][0]).not.toHaveProperty('screenHint');

    getAuthorizationUrl({ config, provider: 'sso', intent: 'signup', state: 'state', client });
    expect(getUrl).toHaveBeenLastCalledWith(expect.objectContaining({
      provider: 'authkit', screenHint: 'sign-up', state: 'state',
    }));
    expect(authenticationMatchesProvider('sso', 'SSO')).toBe(true);
    expect(authenticationMatchesProvider('sso', 'GoogleOAuth')).toBe(false);
  });

  it('builds social authorization URLs with the real SDK validation rules', () => {
    const config = {
      workos: {
        apiKey: 'sk_test_placeholder',
        clientId: 'client_placeholder',
        redirectUri: 'https://app.test/api/auth/callback',
      },
    };
    for (const provider of ['google', 'microsoft']) {
      const url = new URL(getAuthorizationUrl({ config, provider, intent: 'signup', state: 'state' }));
      expect(url.searchParams.get('screen_hint')).toBeNull();
    }
  });

  it('requires a verified identity and never silently merges an email account', async () => {
    await expect(resolveWorkosIdentity({ identity: { id: 'user_1', email: 'a@example.test', emailVerified: false }, intent: 'signup' }))
      .resolves.toEqual({ status: 'unverified' });

    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 4, password: 'hash', workos_user_id: null, email_verified: false }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const database = { connect: vi.fn().mockResolvedValue(client) };
    await expect(resolveWorkosIdentity({ identity: { id: 'user_1', email: 'a@example.test', emailVerified: true }, intent: 'signup' }, database))
      .resolves.toEqual({ status: 'account_link_required' });
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('creates provider-only users and default settings transactionally', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 8, email: 'student@example.test', name: 'Student' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const database = { connect: vi.fn().mockResolvedValue(client) };
    const result = await resolveWorkosIdentity({
      identity: { id: 'user_8', email: 'Student@example.test', emailVerified: true, name: 'Student' },
      intent: 'signup',
    }, database);
    expect(result).toMatchObject({ status: 'authenticated', user: { id: 8 } });
    expect(client.query.mock.calls[3][1]).toEqual(['Student@example.test', 'Student', 'user_8']);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not create a missing account during login intent', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    await expect(resolveWorkosIdentity({
      identity: { id: 'user_9', email: 'missing@example.test', emailVerified: true }, intent: 'login',
    }, { connect: vi.fn().mockResolvedValue(client) })).resolves.toEqual({ status: 'not_found' });
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rolls back and releases the client when transactional creation fails', async () => {
    const failure = new Error('database unavailable');
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    await expect(resolveWorkosIdentity({
      identity: { id: 'user_10', email: 'new@example.test', emailVerified: true }, intent: 'signup',
    }, { connect: vi.fn().mockResolvedValue(client) })).rejects.toThrow('database unavailable');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
