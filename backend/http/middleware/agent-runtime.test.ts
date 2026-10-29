import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(__filename);
const { agentCapabilitiesForRequest, isAgentRuntimeActiveForRequest } = require('./agent-runtime');

describe('agent runtime request boundary', () => {
  it('uses the centralized effective mode for the authenticated actor', () => {
    const effectiveModeForUser = vi.fn((userId) => userId === 42 ? 'active' : 'off');
    const runtimeConfig = { agentExecutionPolicy: { effectiveModeForUser } };
    expect(isAgentRuntimeActiveForRequest(runtimeConfig, { user: { id: 42 } })).toBe(true);
    expect(isAgentRuntimeActiveForRequest(runtimeConfig, { user: { id: 7 } })).toBe(false);
    expect(effectiveModeForUser).toHaveBeenCalledWith(42);
  });

  it('exposes only safe effective capabilities for the authenticated actor', () => {
    const runtimeConfig = { agentExecutionPolicy: { effectiveModeForUser: () => 'shadow' } };
    expect(agentCapabilitiesForRequest(runtimeConfig, { user: { id: 42 } })).toEqual({
      mode: 'shadow', conversationalPlanning: false, asynchronousFormPlanning: false,
      tutoring: false, groundedResources: false,
    });
  });
});
