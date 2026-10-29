const { loadConfiguredTriggerSdk } = require('./trigger-client-config');

const cancelProviderRun = async (providerRunId: any) => {
  if (!providerRunId || !process.env.TRIGGER_SECRET_KEY) return { attempted: false };
  const { runs } = await loadConfiguredTriggerSdk();
  await runs.cancel(providerRunId);
  return { attempted: true };
};

export = { cancelProviderRun };
