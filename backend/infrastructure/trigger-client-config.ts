const getTriggerClientConfiguration = (environment = process.env) => {
  const previewApi = environment.AGENT_RUNTIME_SCOPE === 'preview'
    && environment.DISCIPLAN_EXECUTION_RUNTIME === 'api'
    && environment.VERCEL_ENV === 'preview';
  if (!previewApi || !environment.TRIGGER_SECRET_KEY) return null;
  return {
    accessToken: environment.TRIGGER_SECRET_KEY,
    // Trigger normally maps Vercel's git branch to a paid Preview Branch.
    // Disciplan Preview intentionally targets this isolated project's managed
    // Production environment, so suppress that automatic branch header.
    previewBranch: '',
  };
};

const loadConfiguredTriggerSdk = async () => {
  const sdk = await import('@trigger.dev/sdk');
  const configuration = getTriggerClientConfiguration();
  if (configuration) sdk.auth.configure(configuration);
  return sdk;
};

export = { getTriggerClientConfiguration, loadConfiguredTriggerSdk };
