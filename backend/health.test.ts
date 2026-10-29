import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app.js';

describe('container health endpoint', () => {
  it('reports a healthy API without requiring authentication or database access', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
