const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const projectRef = process.argv[2];
if (!/^proj_[a-z0-9]+$/.test(projectRef || '')) {
  throw new Error('Usage: node backend/scripts/deploy-preview-runtime.js proj_<preview-project-ref>');
}

const executable = (name) => process.platform === 'win32' ? `${name}.cmd` : name;
const run = (command, args, options = {}) => {
  const result = spawnSync(executable(command), args, {
    cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32', ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}${result.error ? `: ${result.error.message}` : ''}.`);
  }
};

const canonicalDatabase = (raw) => {
  const url = new URL(raw);
  return {
    host: url.hostname.replace('-pooler.', '.'),
    database: url.pathname,
    pooled: url.hostname.includes('-pooler.'),
  };
};

const local = dotenv.parse(fs.readFileSync(path.resolve('.env')));
try {
  if (!local.AGENT_DATABASE_URL || !local.GEMINI_API_KEY) {
    throw new Error('The ignored local .env must contain isolated AGENT_DATABASE_URL and GEMINI_API_KEY values.');
  }
  const worker = canonicalDatabase(local.AGENT_DATABASE_URL);
  if (worker.pooled) throw new Error('AGENT_DATABASE_URL must be a direct Neon connection.');
  const migration = canonicalDatabase(local.MIGRATION_DATABASE_URL || '');
  const application = canonicalDatabase(local.DATABASE_URL || '');
  if (migration.host !== worker.host || migration.database !== worker.database) {
    throw new Error('MIGRATION_DATABASE_URL must confirm the same isolated Neon branch as AGENT_DATABASE_URL.');
  }
  if (application.host === worker.host && application.database === worker.database) {
    throw new Error('The preview worker database must remain distinct from the local Production DATABASE_URL.');
  }

  const environment = {
    ...process.env,
    DATABASE_URL: local.AGENT_DATABASE_URL,
    AGENT_DATABASE_URL: local.AGENT_DATABASE_URL,
    GEMINI_API_KEY: local.GEMINI_API_KEY,
    GEMINI_MODEL: local.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    AI_BUDGET_MONTHLY_USD: local.AI_BUDGET_MONTHLY_USD || '5',
    AI_BUDGET_HARD_STOP_USD: local.AI_BUDGET_HARD_STOP_USD || '4',
    AI_MAX_OUTPUT_TOKENS: local.AI_MAX_OUTPUT_TOKENS || '4096',
    AI_THINKING_BUDGET: local.AI_THINKING_BUDGET || '0',
    AI_USER_DAILY_REQUEST_LIMIT: local.AI_USER_DAILY_REQUEST_LIMIT || '20',
    AI_AGENT_MAX_ITERATIONS: local.AI_AGENT_MAX_ITERATIONS || '1',
    AI_AGENT_MAX_MODEL_CALLS: local.AI_AGENT_MAX_MODEL_CALLS || '5',
    AI_AGENT_MAX_TOOL_CALLS: local.AI_AGENT_MAX_TOOL_CALLS || '12',
    AI_AGENT_RUN_MAX_RESERVATION_USD: local.AI_AGENT_RUN_MAX_RESERVATION_USD || '0.10',
    AGENT_ROLLOUT_MODE: 'active',
    AGENT_RUNTIME_SCOPE: 'preview',
    DISCIPLAN_DATA_ENV: 'isolated-preview',
    DISCIPLAN_EXECUTION_RUNTIME: 'trigger',
    TRIGGER_PROJECT_REF: projectRef,
    TRIGGER_SYNC_PREVIEW_ENV: 'true',
  };
  delete environment.JWT_SECRET;
  delete environment.MIGRATION_DATABASE_URL;
  delete environment.TEST_DATABASE_URL;
  delete environment.TRIGGER_SECRET_KEY;
  run('npx', [
    'trigger.dev@4.5.13', 'deploy', '--project-ref', projectRef,
    '--env', 'prod', '--skip-update-check',
  ], { env: environment });
} finally {
  // The deployment environment is process-local; no secret file is created.
}
