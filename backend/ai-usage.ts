const db = require('./db');
const config = require('./config.env');
const crypto = require('crypto');
const { getModelPricing } = require('./agents/runtime-registry');

const MICRO_USD_PER_USD = 1_000_000;
const DEFAULT_STATUS = 'allowed';
const STATUS = {
  allowed: 'allowed',
  blockedBudget: 'blocked_budget',
  blockedUserLimit: 'blocked_user_limit',
  error: 'error',
};

const getMonthlySpendMicroUsd = async (client = db) => {
  const result = await client.query(
    `SELECT COALESCE(SUM(estimated_total_micro_usd), 0)::bigint AS total
     FROM ai_usage_events
     WHERE created_at >= date_trunc('month', NOW())
       AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
  );
  return Number.parseInt(result.rows[0]?.total, 10) || 0;
};

const getUserDailyAiRequestCount = async (userId: any, client = db) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM ai_usage_events
     WHERE user_id = $1
       AND created_at >= date_trunc('day', NOW())
       AND created_at < date_trunc('day', NOW()) + INTERVAL '1 day'
       AND status IN ('allowed', 'error')`,
    [userId],
  );
  return result.rows[0]?.count || 0;
};

const toMicroUsd = (usdAmount: any) => Math.round(usdAmount * MICRO_USD_PER_USD);

const getActiveReservationTotals = async ({ userId, client = db }: any) => {
  const result = await client.query(
    `SELECT
      COALESCE(SUM(GREATEST(reserved_total_micro_usd - used_total_micro_usd, 0)), 0)::bigint AS reserved_micro_usd,
      COALESCE(SUM(GREATEST(reserved_request_count - used_request_count, 0)), 0)::int AS reserved_requests
     FROM ai_budget_reservations
     WHERE status = 'active'
       AND ($1::int IS NULL OR user_id = $1)`,
    [userId || null],
  );
  return {
    reservedMicroUsd: Number.parseInt(result.rows[0]?.reserved_micro_usd, 10) || 0,
    reservedRequests: Number.parseInt(result.rows[0]?.reserved_requests, 10) || 0,
  };
};

const estimateCostMicroUsd = ({ model, promptTokens, outputTokens }: any) => {
  const pricing = getModelPricing(model);
  const inputMicroUsd = Math.round((promptTokens / 1_000_000) * pricing.inputMicroUsdPerMillionTokens);
  const outputMicroUsd = Math.round((outputTokens / 1_000_000) * pricing.outputMicroUsdPerMillionTokens);

  return {
    estimatedInputMicroUsd: inputMicroUsd,
    estimatedOutputMicroUsd: outputMicroUsd,
    estimatedTotalMicroUsd: inputMicroUsd + outputMicroUsd,
  };
};

const extractUsageMetadata = (response: any) => {
  const usage = response?.usageMetadata || {};

  const promptTokens = usage.promptTokenCount
    ?? usage.inputTokenCount
    ?? usage.promptTokens
    ?? 0;

  const outputTokens = usage.candidatesTokenCount
    ?? usage.outputTokenCount
    ?? usage.outputTokens
    ?? 0;

  const totalTokens = usage.totalTokenCount
    ?? usage.totalTokens
    ?? (promptTokens + outputTokens);

  return {
    promptTokens: Math.max(0, Number(promptTokens) || 0),
    outputTokens: Math.max(0, Number(outputTokens) || 0),
    totalTokens: Math.max(0, Number(totalTokens) || 0),
  };
};

const recordAiUsageEvent = async ({
  userId,
  endpoint = '/api/assignments',
  model = config.geminiModel,
  promptTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  estimatedInputMicroUsd = 0,
  estimatedOutputMicroUsd = 0,
  estimatedTotalMicroUsd = 0,
  status = DEFAULT_STATUS,
  runId = null,
  agentRunId = null,
}: any, database = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(
    `INSERT INTO ai_usage_events (
      user_id,
      endpoint,
      model,
      prompt_tokens,
      output_tokens,
      total_tokens,
      estimated_input_micro_usd,
      estimated_output_micro_usd,
      estimated_total_micro_usd,
      status,
      generation_run_id,
      agent_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      userId,
      endpoint,
      model,
      promptTokens,
      outputTokens,
      totalTokens,
      estimatedInputMicroUsd,
      estimatedOutputMicroUsd,
      estimatedTotalMicroUsd,
      status,
      runId,
      agentRunId,
    ],
    );
    if (runId) {
      await client.query(
        `UPDATE ai_budget_reservations
         SET used_total_micro_usd = LEAST(reserved_total_micro_usd, used_total_micro_usd + $2),
             used_request_count = LEAST(reserved_request_count, used_request_count + 1)
         WHERE run_id = $1 AND status = 'active'`,
        [runId, Math.max(0, estimatedTotalMicroUsd)],
      );
    }
    if (agentRunId) {
      await client.query(
        `UPDATE ai_budget_reservations
         SET used_total_micro_usd = LEAST(reserved_total_micro_usd, used_total_micro_usd + $2),
             used_request_count = LEAST(reserved_request_count, used_request_count + 1)
         WHERE agent_run_id = $1 AND status = 'active'`,
        [agentRunId, Math.max(0, estimatedTotalMicroUsd)],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const reserveRunBudget = async ({ runId, userId, reservedTotalMicroUsd, reservedRequestCount }: any) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize reservations against the shared monthly hard stop and the
    // per-user daily request allowance. This is database-backed so concurrent
    // Concurrent agent workers cannot both spend the same remaining budget.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [40400, 0]);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [40401, userId]);
    // A pg PoolClient is a single connection; run transaction queries in
    // sequence rather than concurrently on that connection.
    const monthlyMicroUsd = await getMonthlySpendMicroUsd(client);
    const dailyCount = await getUserDailyAiRequestCount(userId, client);
    const monthlyReservations = await getActiveReservationTotals({ client });
    const userReservations = await getActiveReservationTotals({ userId, client });
    const hardStopMicroUsd = toMicroUsd(config.aiBudgetHardStopUsd);
    const allowed = monthlyMicroUsd + monthlyReservations.reservedMicroUsd + reservedTotalMicroUsd <= hardStopMicroUsd
      && dailyCount + userReservations.reservedRequests + reservedRequestCount <= config.aiUserDailyRequestLimit;
    if (!allowed) {
      await client.query('ROLLBACK');
      return false;
    }
    const existing = await client.query(
      `SELECT id FROM ai_budget_reservations WHERE run_id = $1 AND status = 'active' FOR UPDATE`,
      [runId],
    );
    if (!existing.rowCount) {
      await client.query(
        `INSERT INTO ai_budget_reservations (id, run_id, user_id, reserved_total_micro_usd, reserved_request_count, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [crypto.randomUUID(), runId, userId, reservedTotalMicroUsd, reservedRequestCount],
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const finalizeRunBudget = async ({ runId, status }: any) => {
  if (!['finalized', 'released'].includes(status)) throw new Error('Invalid budget reservation terminal status.');
  await db.query(
    `UPDATE ai_budget_reservations
     SET status = $2, released_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP
     WHERE run_id = $1 AND status = 'active'`,
    [runId, status],
  );
};

const canUseReservedModelCall = async (runId: any) => {
  const result = await db.query(
    `SELECT 1 FROM ai_budget_reservations
     WHERE run_id = $1 AND status = 'active' AND used_request_count < reserved_request_count`,
    [runId],
  );
  return result.rowCount > 0;
};

const reserveAgentRunBudget = async ({ agentRunId, userId, reservedTotalMicroUsd, reservedRequestCount }: any, database = db) => {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [40400, 0]);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [40401, userId]);
    const existing = await client.query(
      `SELECT id FROM ai_budget_reservations
       WHERE agent_run_id = $1 AND status = 'active' FOR UPDATE`,
      [agentRunId],
    );
    // Reservation is idempotent across Trigger retries and checkpoint resumes.
    // Returning before the aggregate check avoids counting this run's existing
    // reservation a second time against the global and per-user limits.
    if (existing.rowCount) {
      await client.query('COMMIT');
      return true;
    }
    const monthlyMicroUsd = await getMonthlySpendMicroUsd(client);
    const dailyCount = await getUserDailyAiRequestCount(userId, client);
    const monthlyReservations = await getActiveReservationTotals({ client });
    const userReservations = await getActiveReservationTotals({ userId, client });
    const allowed = monthlyMicroUsd + monthlyReservations.reservedMicroUsd + reservedTotalMicroUsd <= toMicroUsd(config.aiBudgetHardStopUsd)
      && dailyCount + userReservations.reservedRequests + reservedRequestCount <= config.aiUserDailyRequestLimit;
    if (!allowed) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO ai_budget_reservations (
         id, run_id, agent_run_id, user_id, reserved_total_micro_usd, reserved_request_count, status
       ) VALUES ($1, NULL, $2, $3, $4, $5, 'active')`,
      [crypto.randomUUID(), agentRunId, userId, reservedTotalMicroUsd, reservedRequestCount],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const finalizeAgentRunBudget = async ({ agentRunId, status }: any, database = db) => {
  if (!['finalized', 'released'].includes(status)) throw new Error('Invalid budget reservation terminal status.');
  await database.query(
    `UPDATE ai_budget_reservations
     SET status = $2, released_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP
     WHERE agent_run_id = $1 AND status = 'active'`,
    [agentRunId, status],
  );
};

const canUseReservedAgentModelCall = async (agentRunId: any, database = db) => {
  const result = await database.query(
    `SELECT 1 FROM ai_budget_reservations
     WHERE agent_run_id = $1
       AND status = 'active'
       AND used_request_count < reserved_request_count
       AND used_total_micro_usd < reserved_total_micro_usd`,
    [agentRunId],
  );
  return result.rowCount > 0;
};

const getBudgetGuardDecision = async (userId: any) => {
  const [monthlyMicroUsd, dailyCount, monthlyReservations, userReservations] = await Promise.all([
    getMonthlySpendMicroUsd(),
    getUserDailyAiRequestCount(userId),
    getActiveReservationTotals({}),
    getActiveReservationTotals({ userId }),
  ]);

  const hardStopMicroUsd = toMicroUsd(config.aiBudgetHardStopUsd);

  if (monthlyMicroUsd + monthlyReservations.reservedMicroUsd >= hardStopMicroUsd) {
    return {
      allow: false,
      status: STATUS.blockedBudget,
      monthlyMicroUsd,
      dailyCount,
    };
  }

  if (dailyCount + userReservations.reservedRequests >= config.aiUserDailyRequestLimit) {
    return {
      allow: false,
      status: STATUS.blockedUserLimit,
      monthlyMicroUsd,
      dailyCount,
    };
  }

  return {
    allow: true,
    status: STATUS.allowed,
    monthlyMicroUsd,
    dailyCount,
  };
};

module.exports = {
  STATUS,
  extractUsageMetadata,
  estimateCostMicroUsd,
  getBudgetGuardDecision,
  reserveRunBudget,
  finalizeRunBudget,
  canUseReservedModelCall,
  reserveAgentRunBudget,
  finalizeAgentRunBudget,
  canUseReservedAgentModelCall,
  recordAiUsageEvent,
  toMicroUsd,
};
