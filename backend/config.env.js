const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
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
  databaseUrl: readDatabaseUrl(),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  isProduction,
};

module.exports = config;
