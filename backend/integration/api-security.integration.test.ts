import { PostgreSqlContainer } from '@testcontainers/postgresql';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import type { Application } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseIntegrationEnabled, resolveSuppliedTestDatabaseUrl } from './test-database.js';

const require = createRequire(__filename);
const suppliedUrl = resolveSuppliedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const enabled = databaseIntegrationEnabled(process.env);

describe.skipIf(!enabled)('HTTP security and ownership with Postgres', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  let pool: Pool;
  let app: Application;
  let applicationPool: Pool | undefined;
  const jwtSecret = `integration-secret-${crypto.randomBytes(24).toString('hex')}`;

  beforeAll(async () => {
    let databaseUrl = suppliedUrl;
    if (!databaseUrl) {
      container = await new PostgreSqlContainer('postgres:18-alpine').start();
      databaseUrl = container.getConnectionUri();
    }
    pool = new Pool({ connectionString: databaseUrl });
    process.env.DATABASE_URL = databaseUrl;
    process.env.AGENT_DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecret;
    process.env.AGENT_ROLLOUT_MODE = 'off';
    const { runMigrations } = require('../scripts/migrate');
    await runMigrations({ client: pool });
    app = require('../app');
    applicationPool = require('../db');
  }, 120_000);

  afterAll(async () => {
    await applicationPool?.end();
    await pool?.end();
    await container?.stop();
  });

  it('requires CSRF for cookie-authenticated mutations and accepts the issued token', async () => {
    const browser = request.agent(app);
    const email = `csrf-${crypto.randomUUID()}@example.invalid`;
    const registration = await browser.post('/api/register').send({
      email, name: 'CSRF Student', password: 'correct-horse-battery-staple',
    });
    expect(registration.status).toBe(200);
    const csrfCookie = (registration.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('disciplan_csrf='));
    expect(csrfCookie).toBeTruthy();
    const csrfToken = decodeURIComponent(csrfCookie!.split(';')[0].split('=')[1]);

    expect((await browser.patch('/api/profile').send({ name: 'Blocked Change' })).status).toBe(403);
    const accepted = await browser.patch('/api/profile')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Accepted Change' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.name).toBe('Accepted Change');

    const activeRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agent_runs (
         id,user_id,idempotency_key,request_hash,run_type,trigger_type,status,current_step,graph_version,prompt_bundle_version
       ) VALUES ($1,$2,$3,$4,'conversation','user_message','running','coordinate','integration','integration')`,
      [activeRunId, registration.body.user.id, `delete-${activeRunId}`, crypto.randomUUID()],
    );
    const deleted = await browser.delete('/api/account')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'correct-horse-battery-staple' });
    expect(deleted.status).toBe(200);
    expect((await pool.query('SELECT 1 FROM users WHERE id=$1', [registration.body.user.id])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM agent_runs WHERE id=$1', [activeRunId])).rowCount).toBe(0);
  });

  it('preserves HTTP idempotency and denies cross-user assignment access', async () => {
    const owner = await pool.query(
      `INSERT INTO users (email,password,name) VALUES ($1,'not-a-real-hash','Owner') RETURNING id`,
      [`owner-${crypto.randomUUID()}@example.invalid`],
    );
    const other = await pool.query(
      `INSERT INTO users (email,password,name) VALUES ($1,'not-a-real-hash','Other') RETURNING id`,
      [`other-${crypto.randomUUID()}@example.invalid`],
    );
    const ownerToken = jwt.sign({ id: owner.rows[0].id }, jwtSecret, { expiresIn: '5m' });
    const otherToken = jwt.sign({ id: other.rows[0].id }, jwtSecret, { expiresIn: '5m' });
    const idempotencyKey = `http-${crypto.randomUUID()}`;
    const payload = {
      title: 'HTTP integration assignment', description: 'Exercise safe API boundaries.',
      complexity: 'Medium', dueDate: '2099-12-10', totalItems: 4,
    };
    const first = await request(app).post('/api/assignments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);
    expect(first.status, JSON.stringify(first.body)).toBe(202);
    const duplicate = await request(app).post('/api/assignments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(202);
    expect(duplicate.body.assignment.id).toBe(first.body.assignment.id);

    const feedback = await request(app)
      .post(`/api/assignments/${first.body.assignment.id}/feedback`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ feedbackType: 'helpful' });
    expect(feedback.status).toBe(201);
    expect(feedback.body.feedback).toMatchObject({
      assignment_id: first.body.assignment.id,
      feedback_type: 'helpful',
    });
    expect(feedback.body.feedback.plan_version_id).toBeTruthy();

    const forbiddenFeedback = await request(app)
      .post(`/api/assignments/${first.body.assignment.id}/feedback`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ feedbackType: 'too_heavy' });
    expect(forbiddenFeedback.status).toBe(404);

    const forbiddenRead = await request(app)
      .get(`/api/assignment/plan/${first.body.assignment.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbiddenRead.status).toBe(200);
    expect(forbiddenRead.body).toEqual([]);
    const forbiddenDelete = await request(app)
      .delete(`/api/assignments/${first.body.assignment.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbiddenDelete.status).toBe(404);
    const feedbackRows = await pool.query(
      'SELECT COUNT(*)::int AS count FROM plan_feedback WHERE assignment_id=$1',
      [first.body.assignment.id],
    );
    expect(feedbackRows.rows[0].count).toBe(1);
  });
});
