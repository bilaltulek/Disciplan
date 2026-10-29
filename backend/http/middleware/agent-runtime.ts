const config = require('../../config.env');

const isAgentRuntimeActiveForRequest = (runtimeConfig: any, req: any) => (
  runtimeConfig.agentExecutionPolicy.effectiveModeForUser(req.user?.id) === 'active'
);

const agentCapabilitiesForRequest = (runtimeConfig: any, req: any) => {
  const mode = runtimeConfig.agentExecutionPolicy.effectiveModeForUser(req.user?.id);
  return {
    mode,
    conversationalPlanning: mode === 'active',
    asynchronousFormPlanning: mode === 'active',
    tutoring: mode === 'active',
    groundedResources: mode === 'active',
  };
};

const requireActiveAgentRuntime = (req: any, res: any, next: any) => {
  if (!isAgentRuntimeActiveForRequest(config, req)) {
    return res.status(503).json({
      error: 'Conversational agent execution is not active. Assignment forms still use deterministic planning.',
      code: 'AGENT_RUNTIME_INACTIVE',
    });
  }
  return next();
};

export = { agentCapabilitiesForRequest, isAgentRuntimeActiveForRequest, requireActiveAgentRuntime };
