type TriggerContext = { environment: { type: string }; project?: { ref?: string } };

type ValidationConfig = {
  agentRolloutMode: 'off' | 'shadow' | 'active';
  agentRuntimeScope?: 'standard' | 'preview';
  triggerProjectRef?: string;
  agentExecutionPolicy: {
    validationMode: 'disabled' | 'development';
    dataEnvironment: string;
    canDispatchUser(userId: number): boolean;
  };
};

export const assertDevelopmentValidationEnvironment = (
  runtimeConfig: ValidationConfig,
  context: TriggerContext,
) => {
  if (runtimeConfig.agentRuntimeScope === 'preview') {
    if (runtimeConfig.agentRolloutMode !== 'active'
      || runtimeConfig.agentExecutionPolicy.dataEnvironment !== 'isolated-preview'
      || context.environment.type !== 'PRODUCTION'
      || !runtimeConfig.triggerProjectRef
      || context.project?.ref !== runtimeConfig.triggerProjectRef) {
      throw Object.assign(new Error('Preview runtime environment guard rejected task execution.'), {
        code: 'PREVIEW_ENVIRONMENT_REJECTED',
      });
    }
    return;
  }
  if (runtimeConfig.agentExecutionPolicy.validationMode !== 'development') return;
  if (runtimeConfig.agentRolloutMode !== 'off'
    || runtimeConfig.agentExecutionPolicy.dataEnvironment !== 'isolated-preview'
    || context.environment.type !== 'DEVELOPMENT') {
    throw Object.assign(new Error('Development validation environment guard rejected task execution.'), {
      code: 'VALIDATION_ENVIRONMENT_REJECTED',
    });
  }
};

export const assertRunAllowed = async (
  database: { query(sql: string, values: unknown[]): Promise<{ rows: Array<{ user_id: number }> }> },
  runtimeConfig: ValidationConfig,
  runId: string,
) => {
  if (runtimeConfig.agentRolloutMode !== 'off') return;
  const result = await database.query('SELECT user_id FROM agent_runs WHERE id = $1', [runId]);
  if (!result.rows[0] || !runtimeConfig.agentExecutionPolicy.canDispatchUser(result.rows[0].user_id)) {
    throw Object.assign(new Error('The run is outside the development validation allowlist.'), {
      code: 'VALIDATION_RUN_NOT_ALLOWED',
    });
  }
};
