import type { Pool, PoolClient } from 'pg';

const db = require('../worker-db') as Pool;

const TRANSIENT_RUN_FAILURE_CODES = new Set([
  '40001', '40P01', '53300', '57P01', '08000', '08003', '08006',
  'ECONNRESET', 'ETIMEDOUT', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'TRIGGER_DISPATCH_FAILED',
  'MODEL_QUOTA_EXCEEDED', 'AGENT_RUNTIME_FAILED',
]);

export const classifyRunFailure = (error: unknown, attemptNumber: number) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'AGENT_RUNTIME_FAILED';
  return { code, terminal: attemptNumber >= 3 || !TRANSIENT_RUN_FAILURE_CODES.has(code) };
};

export const appendRunEvent = async (runId: string, eventType: string, step: string, detailCode: string, safeDetail: string) => {
  await db.query(
    `INSERT INTO agent_run_events (run_id, event_type, step, detail_code, safe_detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [runId, eventType, step, detailCode, safeDetail],
  );
};

export const safeModelFailure = (error: unknown) => {
  const candidate = error as { name?: string; code?: string; issues?: Array<{ path?: Array<string | number> }> };
  if (Array.isArray(candidate?.issues)) {
    const fields = [...new Set(candidate.issues.map((issue) => issue.path?.join('.') || 'response'))].slice(0, 8);
    return { code: 'MODEL_DRAFT_SCHEMA_INVALID', detail: `The model draft failed schema fields: ${fields.join(', ')}.` };
  }
  if (candidate?.code === 'MODEL_CALL_LIMIT') return { code: 'MODEL_DRAFT_CALL_LIMIT', detail: 'The model draft exceeded its bounded call limit.' };
  if (candidate?.code === 'MODEL_SAFETY_BLOCK') return { code: 'MODEL_DRAFT_SAFETY_BLOCK', detail: 'The model draft was blocked by provider safety controls.' };
  if (candidate?.code === 'MODEL_TIMEOUT') return { code: 'MODEL_DRAFT_TIMEOUT', detail: 'The model draft timed out safely.' };
  if (candidate?.code === 'MODEL_QUOTA_EXCEEDED') return { code: 'MODEL_DRAFT_QUOTA_EXCEEDED', detail: 'The model draft could not run within provider quota.' };
  if (candidate?.code === 'MODEL_NOT_FOUND' || candidate?.code === 'MODEL_AUTHENTICATION_FAILED' || candidate?.code === 'MODEL_REQUEST_INVALID') {
    return { code: 'MODEL_DRAFT_CONFIGURATION_FAILED', detail: 'The model draft provider configuration was rejected.' };
  }
  if (candidate?.code === 'MODEL_STRUCTURE_INVALID' || candidate?.name === 'StructuredOutputParsingError') {
    return { code: 'MODEL_DRAFT_STRUCTURE_INVALID', detail: 'The model draft did not return the required structured response.' };
  }
  return { code: 'MODEL_DRAFT_PROVIDER_FAILED', detail: 'The model draft provider call failed safely.' };
};

export const acquireExecutionLock = async (runId: string) => {
  const client = await db.connect();
  const result = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [`agent-run:${runId}`]);
  if (!result.rows[0]?.acquired) {
    client.release();
    return null;
  }
  return client;
};

export const releaseExecutionLock = async (client: PoolClient, runId: string) => {
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`agent-run:${runId}`]);
  } finally {
    client.release();
  }
};
