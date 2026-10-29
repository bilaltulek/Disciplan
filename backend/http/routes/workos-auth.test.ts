import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWorkosAuthRouter } = require('./workos-auth');

const configured = {
  cookieSecure: true,
  workos: {
    apiKey: 'secret', clientId: 'client', redirectUri: 'https://app.test/api/auth/callback', redirectUriValid: true,
    enabled: { google: true, microsoft: false, sso: true },
  },
};

const createTestApp = (overrides: any = {}) => {
  const service = {
    PROVIDERS: { google: {}, microsoft: {}, sso: {} },
    INTENTS: new Set(['login', 'signup']),
    providerCapabilities: vi.fn().mockReturnValue({ google: true, microsoft: false, sso: true }),
    sanitizeReturnPath: vi.fn((path: any) => path === '/assistant' ? path : '/dashboard'),
    createOAuthState: vi.fn().mockResolvedValue('state-token'),
    consumeOAuthState: vi.fn().mockResolvedValue({ provider: 'google', intent: 'login', return_path: '/dashboard' }),
    getAuthorizationUrl: vi.fn().mockReturnValue('https://example.workos.com/authorize'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      authenticationMethod: 'GoogleOAuth',
      user: { id: 'user_1', email: 'student@example.test', emailVerified: true },
    }),
    authenticationMatchesProvider: vi.fn().mockReturnValue(true),
    resolveWorkosIdentity: vi.fn().mockResolvedValue({ status: 'authenticated', user: { id: 7 } }),
    ...overrides.service,
  };
  const app = express();
  app.use('/api/auth', createWorkosAuthRouter({
    config: overrides.config || configured,
    issueToken: vi.fn().mockReturnValue('local-jwt'),
    setAuthCookie: (res: any, token: any) => res.append('Set-Cookie', `token=${token}; HttpOnly; Path=/`),
    rateLimit: (_req: any, _res: any, next: any) => next(),
    logger: { warn: vi.fn() },
    service,
  }));
  return { app, service };
};

describe('WorkOS auth routes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns enabled booleans only', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/auth/providers');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ google: true, microsoft: false, sso: true });
  });

  it('rejects unknown, disabled, and invalid-intent starts before redirecting', async () => {
    const { app, service } = createTestApp();
    expect((await request(app).get('/api/auth/github/start?intent=login')).status).toBe(404);
    expect((await request(app).get('/api/auth/microsoft/start?intent=login')).status).toBe(404);
    expect((await request(app).get('/api/auth/google/start?intent=other')).status).toBe(400);
    expect(service.createOAuthState).not.toHaveBeenCalled();
  });

  it('sets short-lived HttpOnly state and redirects an enabled provider', async () => {
    const { app, service } = createTestApp();
    const response = await request(app).get('/api/auth/google/start?intent=signup&returnTo=/assistant');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://example.workos.com/authorize');
    expect(response.headers['set-cookie'][0]).toMatch(/disciplan_oauth_state=state-token; HttpOnly; SameSite=Lax; Path=\/api\/auth; Max-Age=600; Secure/);
    expect(service.createOAuthState).toHaveBeenCalledWith({ provider: 'google', intent: 'signup', returnPath: '/assistant' });
  });

  it('rejects missing, expired, or replayed state before code exchange', async () => {
    const { app, service } = createTestApp({ service: { consumeOAuthState: vi.fn().mockResolvedValue(null) } });
    const response = await request(app).get('/api/auth/callback?state=invalid&code=code');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login?auth_error=state_invalid');
    expect(service.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('establishes the existing local session after a verified callback', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/auth/callback?state=state-token&code=one-time-code')
      .set('Cookie', 'disciplan_oauth_state=state-token');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/dashboard');
    expect(String(response.headers['set-cookie'])).toContain('token=local-jwt');
    expect(String(response.headers['set-cookie'])).toContain('disciplan_oauth_state=;');
  });

  it('does not issue a session for provider mismatch or unresolved identity', async () => {
    const mismatch = createTestApp({ service: { authenticationMatchesProvider: vi.fn().mockReturnValue(false) } });
    expect((await request(mismatch.app).get('/api/auth/callback?state=x&code=x')).headers.location)
      .toBe('/login?auth_error=provider_mismatch');

    const unresolved = createTestApp({ service: { resolveWorkosIdentity: vi.fn().mockResolvedValue({ status: 'account_link_required' }) } });
    expect((await request(unresolved.app).get('/api/auth/callback?state=x&code=x')).headers.location)
      .toBe('/login?auth_error=account_link_required');
  });
});
