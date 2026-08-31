export const resolveSuppliedTestDatabaseUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const placeholderHost = parsed.hostname.includes('_host') || parsed.hostname.endsWith('.invalid');
    const placeholderUser = parsed.username.endsWith('_USER') || parsed.username.endsWith('_user');
    const placeholderDatabase = parsed.pathname.includes('DB_NAME');
    return parsed.protocol.startsWith('postgres') && !placeholderHost && !placeholderUser && !placeholderDatabase
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

export const databaseIntegrationEnabled = (environment: NodeJS.ProcessEnv): boolean => (
  environment.RUN_DB_INTEGRATION === 'true'
);
