const parseUserIds = (raw: any, name: any) => {
  if (!raw || !raw.trim()) return new Set();
  const ids = raw.split(',').map((value: any) => value.trim()).filter(Boolean).map((value: any) => {
    if (!/^\d+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
      throw new Error(`Invalid environment variable: ${name} must contain comma-separated positive integer user IDs.`);
    }
    return Number(value);
  });
  return new Set(ids);
};

const canonicalNeonDatabase = (raw: any, name: any) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid environment variable: ${name} must be a Postgres URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`Invalid environment variable: ${name} must be a Postgres URL.`);
  }
  return {
    database: url.pathname.replace(/^\//, ''),
    host: url.hostname.replace('-pooler.', '.'),
    pooled: url.hostname.includes('-pooler.'),
  };
};

const assertMatchingAgentDatabases = ({ databaseUrl, agentDatabaseUrl, message }: any) => {
  const application = canonicalNeonDatabase(databaseUrl, 'DATABASE_URL');
  const agent = canonicalNeonDatabase(agentDatabaseUrl, 'AGENT_DATABASE_URL');
  if (!application.pooled || agent.pooled
    || application.host !== agent.host || application.database !== agent.database) {
    throw new Error(message);
  }
};

const assertMatchingValidationDatabases = ({ policy, databaseUrl, agentDatabaseUrl }: any) => {
  if (policy.validationMode !== 'development') return;
  assertMatchingAgentDatabases({
    databaseUrl,
    agentDatabaseUrl,
    message: 'Development validation requires DATABASE_URL (pooled) and AGENT_DATABASE_URL (direct) for the same isolated Neon database.',
  });
};

const assertPreviewRuntimeConfiguration = ({
  runtimeScope, executionRuntime, rolloutMode, dataEnvironment, vercelEnvironment, databaseUrl, agentDatabaseUrl,
}: any) => {
  if (runtimeScope !== 'preview') return;
  if (dataEnvironment !== 'isolated-preview') {
    throw new Error('Preview agent runtime requires DISCIPLAN_DATA_ENV=isolated-preview.');
  }
  if (vercelEnvironment && vercelEnvironment !== 'preview') {
    throw new Error('Preview agent runtime may run only in Vercel Preview.');
  }
  if (!['off', 'active'].includes(rolloutMode)) {
    throw new Error('Preview agent runtime must use AGENT_ROLLOUT_MODE=off or active.');
  }
  if (executionRuntime === 'trigger') {
    const application = canonicalNeonDatabase(databaseUrl, 'DATABASE_URL');
    const agent = canonicalNeonDatabase(agentDatabaseUrl, 'AGENT_DATABASE_URL');
    if (application.pooled || agent.pooled
      || application.host !== agent.host || application.database !== agent.database) {
      throw new Error('Preview Trigger runtime requires matching direct URLs for the isolated Neon database.');
    }
  } else {
    assertMatchingAgentDatabases({
      databaseUrl,
      agentDatabaseUrl,
      message: 'Preview API runtime requires pooled and direct URLs for the same isolated Neon database.',
    });
  }
};

const createAgentExecutionPolicy = ({
  rolloutMode,
  validationMode = 'disabled',
  dataEnvironment = '',
  vercelEnvironment = '',
  activeUserIds = '',
  shadowUserIds = '',
  validationFaultsEnabled = false,
}: any) => {
  if (!['disabled', 'development'].includes(validationMode)) {
    throw new Error('Invalid environment variable: AGENT_VALIDATION_MODE must be disabled or development.');
  }
  const active = parseUserIds(activeUserIds, 'AGENT_VALIDATION_ACTIVE_USER_IDS');
  const shadow = parseUserIds(shadowUserIds, 'AGENT_VALIDATION_SHADOW_USER_IDS');

  if (validationMode === 'development') {
    if (rolloutMode !== 'off') {
      throw new Error('Development validation requires AGENT_ROLLOUT_MODE=off.');
    }
    if (dataEnvironment !== 'isolated-preview') {
      throw new Error('Development validation requires DISCIPLAN_DATA_ENV=isolated-preview.');
    }
    if (vercelEnvironment && vercelEnvironment !== 'preview') {
      throw new Error('Development validation may run only in Vercel Preview.');
    }
    if (!active.size || !shadow.size) {
      throw new Error('Development validation requires nonempty active and shadow user allowlists.');
    }
    if ([...active].some((userId) => shadow.has(userId))) {
      throw new Error('Development validation active and shadow user allowlists must be disjoint.');
    }
  } else if (active.size || shadow.size || validationFaultsEnabled) {
    throw new Error('Validation allowlists and fault fixtures require AGENT_VALIDATION_MODE=development.');
  }

  const effectiveModeForUser = (userId: any) => {
    if (rolloutMode !== 'off') return rolloutMode;
    if (validationMode !== 'development') return 'off';
    const id = Number(userId);
    if (active.has(id)) return 'active';
    if (shadow.has(id)) return 'shadow';
    return 'off';
  };

  return Object.freeze({
    validationMode,
    dataEnvironment,
    validationFaultsEnabled: Boolean(validationFaultsEnabled),
    activeUserIds: Object.freeze([...active]),
    shadowUserIds: Object.freeze([...shadow]),
    effectiveModeForUser,
    isValidationUser: (userId: any) => effectiveModeForUser(userId) !== 'off' && rolloutMode === 'off',
    canDispatchUser: (userId: any) => effectiveModeForUser(userId) !== 'off',
  });
};

export = {
  assertMatchingValidationDatabases,
  assertPreviewRuntimeConfiguration,
  canonicalNeonDatabase,
  createAgentExecutionPolicy,
  parseUserIds,
};
