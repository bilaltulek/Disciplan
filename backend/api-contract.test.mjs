import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app.js';

describe('public API behavioral baseline', () => {
  it('keeps health public and independent of authentication', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('keeps external providers public, minimal, and disabled by default', async () => {
    const response = await request(app).get('/api/auth/providers');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ google: false, microsoft: false, sso: false });
  });

  it('validates registration before attempting persistence', async () => {
    const response = await request(app).post('/api/register').send({
      name: '', email: 'not-an-email', password: 'short',
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details.map((detail) => detail.field)).toEqual(['email', 'password', 'name']);
  });

  it.each([
    ['GET', '/api/me'],
    ['GET', '/api/settings'],
    ['GET', '/api/assignments'],
    ['GET', '/api/timeline'],
    ['GET', '/api/history'],
    ['GET', '/api/agent-runs/00000000-0000-0000-0000-000000000000'],
  ])('requires authentication for %s %s', async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required.' });
  });
});
