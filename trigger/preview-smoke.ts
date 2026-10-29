export type PreviewSmokeDatabase = {
  query(sql: string): Promise<unknown>;
};

export type PreviewSmokeConfig = {
  agentRolloutMode: 'off' | 'shadow' | 'active';
  geminiApiKey: string;
  agentExecutionPolicy: { validationMode: string; dataEnvironment: string };
  agentRuntimeScope?: string;
};

export const runPreviewSmoke = async (
  database: PreviewSmokeDatabase,
  runtimeConfig: PreviewSmokeConfig,
  triggerEnvironmentType = 'UNKNOWN',
) => {
  await database.query('SELECT 1');

  return {
    databaseReady: true,
    geminiConfigured: runtimeConfig.geminiApiKey.length > 0,
    rolloutMode: runtimeConfig.agentRolloutMode,
    developmentEnvironment: triggerEnvironmentType === 'DEVELOPMENT',
    managedPreviewRuntime: runtimeConfig.agentRuntimeScope === 'preview'
      && triggerEnvironmentType === 'PRODUCTION',
    isolatedDataEnvironment: runtimeConfig.agentExecutionPolicy.dataEnvironment === 'isolated-preview',
  };
};
