import { defineConfig } from '@trigger.dev/sdk';
import { syncEnvVars } from '@trigger.dev/build/extensions/core';

const previewRuntimeVariableNames = [
  'DATABASE_URL',
  'AGENT_DATABASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_ROUTER_MODEL',
  'GEMINI_AGENT_MODEL',
  'GEMINI_SEARCH_MODEL',
  'AI_BUDGET_MONTHLY_USD',
  'AI_BUDGET_HARD_STOP_USD',
  'AI_MAX_OUTPUT_TOKENS',
  'AI_THINKING_BUDGET',
  'AI_USER_DAILY_REQUEST_LIMIT',
  'AI_AGENT_MAX_ITERATIONS',
  'AI_AGENT_MAX_MODEL_CALLS',
  'AI_AGENT_MAX_TOOL_CALLS',
  'AI_AGENT_MAX_SEARCH_CALLS',
  'AI_SEARCH_MONTHLY_REQUEST_LIMIT',
  'AI_AGENT_RUN_MAX_RESERVATION_USD',
  'AGENT_ROLLOUT_MODE',
  'AGENT_RUNTIME_SCOPE',
  'DISCIPLAN_DATA_ENV',
  'DISCIPLAN_EXECUTION_RUNTIME',
  'TRIGGER_PROJECT_REF',
] as const;

const previewRuntimeEnvironment = () => Object.fromEntries(
  previewRuntimeVariableNames.flatMap((name) => (
    process.env[name] ? [[name, process.env[name] as string]] : []
  )),
);

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || 'proj_tepkfgmarlbrlywqkcao',
  runtime: 'node-22',
  logLevel: 'info',
  maxDuration: 600,
  dirs: ['./trigger'],
  build: {
    extensions: process.env.TRIGGER_SYNC_PREVIEW_ENV === 'true'
      ? [syncEnvVars(async () => previewRuntimeEnvironment())]
      : [],
  },
});
