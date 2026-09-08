const path = require('path');
const {
  assertMatchingValidationDatabases, assertPreviewRuntimeConfiguration, createAgentExecutionPolicy,
} = require('./domain/agent-execution-policy');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const toPositiveInt = (value, fallback, name) => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid environment variable: ${name} must be a positive integer.`);
  }
  return parsed;
};

const toNonNegativeInt = (value, fallback, name) => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid environment variable: ${name} must be a non-negative integer.`);
  }
  return parsed;
};

const toPositiveFloat = (value, fallback, name) => {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid environment variable: ${name} must be a positive number.`);
  }
  return parsed;
};

const parseOrigins = (raw) => (raw || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const toBoolean = (value) => value === 'true';
const toEnum = (value, fallback, allowed, name) => {
  const selected = value || fallback;
  if (!allowed.includes(selected)) {
    throw new Error(`Invalid environment variable: ${name} must be one of ${allowed.join(', ')}.`);
  }
  return selected;
};
const previewOrigin = () => {
  if (process.env.VERCEL_ENV !== 'preview' || !process.env.VERCEL_URL) return [];
  return [`https://${process.env.VERCEL_URL.trim()}`];
};
const isValidWorkosRedirectUri = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const allowedProtocol = parsed.protocol === 'https:' || (!isProduction && parsed.protocol === 'http:');
    return allowedProtocol
      && parsed.pathname === '/api/auth/callback'
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
};
const isProduction = process.env.NODE_ENV === 'production';
const agentRolloutMode = toEnum(
  process.env.AGENT_ROLLOUT_MODE,
  isProduction ? 'off' : 'active',
  ['off', 'shadow', 'active'],
  'AGENT_ROLLOUT_MODE',
);
const agentExecutionPolicy = createAgentExecutionPolicy({
  rolloutMode: agentRolloutMode,
  validationMode: process.env.AGENT_VALIDATION_MODE || 'disabled',
  dataEnvironment: process.env.DISCIPLAN_DATA_ENV || '',
  vercelEnvironment: process.env.VERCEL_ENV || '',
  activeUserIds: process.env.AGENT_VALIDATION_ACTIVE_USER_IDS || '',
  shadowUserIds: process.env.AGENT_VALIDATION_SHADOW_USER_IDS || '',
  validationFaultsEnabled: process.env.AGENT_VALIDATION_FAULTS_ENABLED === 'true',
});

const readJwtSecret = () => {
  const value = process.env.JWT_SECRET;
  if (value && value.trim().length >= 32) {
    return value;
  }
  if (isProduction) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }
  const fallback = 'dev-only-jwt-secret-change-me-32-characters';
  console.warn('[config] JWT_SECRET not set (or too short). Using an insecure dev fallback.');
  return fallback;
};

const readGeminiApiKey = () => {
  const value = process.env.GEMINI_API_KEY;
  if (value && value.trim().length > 0) {
    return value;
  }
  if (isProduction && agentRolloutMode !== 'off') {
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  console.warn('[config] GEMINI_API_KEY not set. Falling back to local plan generation.');
  return '';
};

const readDatabaseUrl = () => {
  const value = process.env.DATABASE_URL;
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  if (isProduction) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  const fallback = 'postgres://postgres:postgres@localhost:5432/disciplan';
  console.warn('[config] DATABASE_URL not set. Falling back to local Postgres default.');
  return fallback;
};

const databaseUrl = readDatabaseUrl();
const agentDatabaseUrl = (process.env.AGENT_DATABASE_URL || databaseUrl).trim();
const agentRuntimeScope = toEnum(
  process.env.AGENT_RUNTIME_SCOPE,
  'standard',
  ['standard', 'preview'],
  'AGENT_RUNTIME_SCOPE',
);
const executionRuntime = toEnum(
  process.env.DISCIPLAN_EXECUTION_RUNTIME,
  'api',
  ['api', 'trigger'],
  'DISCIPLAN_EXECUTION_RUNTIME',
);
const triggerProjectRef = process.env.TRIGGER_PROJECT_REF || 'proj_tepkfgmarlbrlywqkcao';
assertMatchingValidationDatabases({
  policy: agentExecutionPolicy,
  databaseUrl,
  agentDatabaseUrl,
});
assertPreviewRuntimeConfiguration({
  runtimeScope: agentRuntimeScope,
  executionRuntime,
  rolloutMode: agentRolloutMode,
  dataEnvironment: process.env.DISCIPLAN_DATA_ENV || '',
  vercelEnvironment: process.env.VERCEL_ENV || '',
  databaseUrl,
  agentDatabaseUrl,
});

const config = {
  port: toInt(process.env.PORT, 5000),
  // Secrets are resolved only by the runtime that actually consumes them.
  // Trigger task bundles can import shared configuration without receiving the
  // API's JWT signing key, and Vercel can run the API without a Gemini key.
  get jwtSecret() {
    return readJwtSecret();
  },
  get geminiApiKey() {
    return readGeminiApiKey();
  },
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  geminiRouterModel: process.env.GEMINI_ROUTER_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  geminiAgentModel: process.env.GEMINI_AGENT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  geminiSearchModel: process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_AGENT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  aiBudgetMonthlyUsd: toPositiveFloat(process.env.AI_BUDGET_MONTHLY_USD, 20, 'AI_BUDGET_MONTHLY_USD'),
  aiBudgetHardStopUsd: toPositiveFloat(process.env.AI_BUDGET_HARD_STOP_USD, 19, 'AI_BUDGET_HARD_STOP_USD'),
  aiMaxOutputTokens: toPositiveInt(process.env.AI_MAX_OUTPUT_TOKENS, 4096, 'AI_MAX_OUTPUT_TOKENS'),
  aiThinkingBudget: toNonNegativeInt(process.env.AI_THINKING_BUDGET, 0, 'AI_THINKING_BUDGET'),
  aiUserDailyRequestLimit: toPositiveInt(process.env.AI_USER_DAILY_REQUEST_LIMIT, 20, 'AI_USER_DAILY_REQUEST_LIMIT'),
  aiAgentMaxIterations: toPositiveInt(process.env.AI_AGENT_MAX_ITERATIONS, 1, 'AI_AGENT_MAX_ITERATIONS'),
  aiAgentMaxModelCalls: toPositiveInt(process.env.AI_AGENT_MAX_MODEL_CALLS, 5, 'AI_AGENT_MAX_MODEL_CALLS'),
  aiAgentMaxToolCalls: toPositiveInt(process.env.AI_AGENT_MAX_TOOL_CALLS, 12, 'AI_AGENT_MAX_TOOL_CALLS'),
  aiAgentMaxSearchCalls: toPositiveInt(process.env.AI_AGENT_MAX_SEARCH_CALLS, 2, 'AI_AGENT_MAX_SEARCH_CALLS'),
  aiSearchMonthlyRequestLimit: toPositiveInt(process.env.AI_SEARCH_MONTHLY_REQUEST_LIMIT, 100, 'AI_SEARCH_MONTHLY_REQUEST_LIMIT'),
  aiAgentRunMaxReservationUsd: toPositiveFloat(
    process.env.AI_AGENT_RUN_MAX_RESERVATION_USD,
    0.10,
    'AI_AGENT_RUN_MAX_RESERVATION_USD',
  ),
  databaseUrl,
  agentDatabaseUrl,
  migrationDatabaseUrl: (process.env.MIGRATION_DATABASE_URL || databaseUrl).trim(),
  agentRolloutMode,
  agentRuntimeScope,
  executionRuntime,
  triggerProjectRef,
  agentExecutionPolicy,
  corsOrigins: [...new Set([
    ...parseOrigins(process.env.CORS_ORIGINS || 'http://localhost:5173'),
    ...previewOrigin(),
  ])],
  // The Docker worker is intentionally opt-in and must never run in production.
  agentWorkerEnabled: process.env.AGENT_WORKER_ENABLED === 'true' && !isProduction,
  agentWorkerPollMs: toPositiveInt(process.env.AGENT_WORKER_POLL_MS, 5_000, 'AGENT_WORKER_POLL_MS'),
  agentWorkerMaxAttempts: toPositiveInt(process.env.AGENT_WORKER_MAX_ATTEMPTS, 3, 'AGENT_WORKER_MAX_ATTEMPTS'),
  cookieSecure: process.env.COOKIE_SECURE === undefined
    ? isProduction
    : process.env.COOKIE_SECURE === 'true',
  isProduction,
  workos: {
    apiKey: (process.env.WORKOS_API_KEY || '').trim(),
    clientId: (process.env.WORKOS_CLIENT_ID || '').trim(),
    redirectUri: (process.env.WORKOS_REDIRECT_URI || '').trim(),
    redirectUriValid: isValidWorkosRedirectUri((process.env.WORKOS_REDIRECT_URI || '').trim()),
    enabled: {
      google: toBoolean(process.env.AUTH_GOOGLE_ENABLED),
      microsoft: toBoolean(process.env.AUTH_MICROSOFT_ENABLED),
      sso: toBoolean(process.env.AUTH_SSO_ENABLED),
    },
  },
};

if (config.aiBudgetHardStopUsd > config.aiBudgetMonthlyUsd) {
  throw new Error('Invalid AI budget configuration: AI_BUDGET_HARD_STOP_USD cannot exceed AI_BUDGET_MONTHLY_USD.');
}

if (config.aiAgentRunMaxReservationUsd > config.aiBudgetHardStopUsd) {
  throw new Error('Invalid AI budget configuration: AI_AGENT_RUN_MAX_RESERVATION_USD cannot exceed AI_BUDGET_HARD_STOP_USD.');
}

if (config.aiAgentMaxIterations > 1 || config.aiAgentMaxModelCalls > 5 || config.aiAgentMaxToolCalls > 12 || config.aiAgentMaxSearchCalls > 2) {
  throw new Error('Agent workflow limits are bounded at one revision, five model calls, and twelve tool calls.');
}

if (config.isProduction && process.env.LANGSMITH_TRACING === 'true') {
  throw new Error('Raw LangSmith tracing is disabled in production by the Disciplan retention policy.');
}

module.exports = config;
