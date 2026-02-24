require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const required = (name, minLength = 1) => {
  const value = process.env[name];
  if (!value || value.trim().length < minLength) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseOrigins = (raw) => raw.split(',').map((origin) => origin.trim()).filter(Boolean);

const config = {
  port: toInt(process.env.PORT, 5000),
  jwtSecret: required('JWT_SECRET', 32),
  geminiApiKey: required('GEMINI_API_KEY', 1),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  isProduction: process.env.NODE_ENV === 'production',
};

module.exports = config;
