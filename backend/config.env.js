const path = require('path');
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
const isProduction = process.env.NODE_ENV === 'production';

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
  if (isProduction) {
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

const config = {
  port: toInt(process.env.PORT, 5000),
  jwtSecret: readJwtSecret(),
  geminiApiKey: readGeminiApiKey(),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  aiBudgetMonthlyUsd: toPositiveFloat(process.env.AI_BUDGET_MONTHLY_USD, 20, 'AI_BUDGET_MONTHLY_USD'),
  aiBudgetHardStopUsd: toPositiveFloat(process.env.AI_BUDGET_HARD_STOP_USD, 19, 'AI_BUDGET_HARD_STOP_USD'),
  aiMaxOutputTokens: toPositiveInt(process.env.AI_MAX_OUTPUT_TOKENS, 600, 'AI_MAX_OUTPUT_TOKENS'),
  aiThinkingBudget: toNonNegativeInt(process.env.AI_THINKING_BUDGET, 0, 'AI_THINKING_BUDGET'),
  aiUserDailyRequestLimit: toPositiveInt(process.env.AI_USER_DAILY_REQUEST_LIMIT, 20, 'AI_USER_DAILY_REQUEST_LIMIT'),
  databaseUrl: readDatabaseUrl(),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  isProduction,
};

if (config.aiBudgetHardStopUsd > config.aiBudgetMonthlyUsd) {
  throw new Error('Invalid AI budget configuration: AI_BUDGET_HARD_STOP_USD cannot exceed AI_BUDGET_MONTHLY_USD.');
}

module.exports = config;
