const db = require('./db');
const config = require('./config.env');

// Gemini 2.5 Flash-Lite pricing in USD per 1M tokens.
// Keep this updated with official pricing as it may change.
const MODEL_PRICING_USD_PER_1M = {
  'gemini-2.5-flash-lite': {
    input: 0.1,
    output: 0.4,
  },
};

const MICRO_USD_PER_USD = 1_000_000;
const DEFAULT_STATUS = 'allowed';
const STATUS = {
  allowed: 'allowed',
  blockedBudget: 'blocked_budget',
  blockedUserLimit: 'blocked_user_limit',
  error: 'error',
};

const getMonthlySpendMicroUsd = async () => {
  const result = await db.query(
    `SELECT COALESCE(SUM(estimated_total_micro_usd), 0)::bigint AS total
     FROM ai_usage_events
     WHERE created_at >= date_trunc('month', NOW())
       AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
  );
  return Number.parseInt(result.rows[0]?.total, 10) || 0;
};

const getUserDailyAiRequestCount = async (userId) => {
  const result = await db.query(
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

const toMicroUsd = (usdAmount) => Math.round(usdAmount * MICRO_USD_PER_USD);

const getModelPricing = (model) => MODEL_PRICING_USD_PER_1M[model] || MODEL_PRICING_USD_PER_1M['gemini-2.5-flash-lite'];

const estimateCostMicroUsd = ({ model, promptTokens, outputTokens }) => {
  const pricing = getModelPricing(model);
  const inputUsd = (promptTokens / 1_000_000) * pricing.input;
  const outputUsd = (outputTokens / 1_000_000) * pricing.output;
  const inputMicroUsd = toMicroUsd(inputUsd);
  const outputMicroUsd = toMicroUsd(outputUsd);

  return {
    estimatedInputMicroUsd: inputMicroUsd,
    estimatedOutputMicroUsd: outputMicroUsd,
    estimatedTotalMicroUsd: inputMicroUsd + outputMicroUsd,
  };
};

const extractUsageMetadata = (response) => {
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
}) => {
  await db.query(
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
      status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
    ],
  );
};

const getBudgetGuardDecision = async (userId) => {
  const [monthlyMicroUsd, dailyCount] = await Promise.all([
    getMonthlySpendMicroUsd(),
    getUserDailyAiRequestCount(userId),
  ]);

  const hardStopMicroUsd = toMicroUsd(config.aiBudgetHardStopUsd);

  if (monthlyMicroUsd >= hardStopMicroUsd) {
    return {
      allow: false,
      status: STATUS.blockedBudget,
      monthlyMicroUsd,
      dailyCount,
    };
  }

  if (dailyCount >= config.aiUserDailyRequestLimit) {
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
  recordAiUsageEvent,
  toMicroUsd,
};
