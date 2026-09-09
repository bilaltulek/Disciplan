import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/**/*.test.{js,mjs,ts}'],
    environment: 'node',
    setupFiles: ['tsx/cjs'],
    env: {
      // Unit tests must not inherit a developer's live validation allowlists or
      // database topology from an ignored .env file.
      AGENT_VALIDATION_MODE: 'disabled',
      AGENT_VALIDATION_ACTIVE_USER_IDS: '',
      AGENT_VALIDATION_SHADOW_USER_IDS: '',
      AGENT_VALIDATION_FAULTS_ENABLED: 'false',
      DISCIPLAN_DATA_ENV: '',
      VERCEL_ENV: '',
    },
  },
});
