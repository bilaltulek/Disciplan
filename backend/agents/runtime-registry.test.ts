import { describe, expect, it } from 'vitest';

const registry = require('./runtime-registry');

describe('agent runtime registry', () => {
  it('pins graph and prompt versions and hashes the complete prompt bundle', () => {
    expect(registry.GRAPH_VERSION).toMatch(/^disciplan-stategraph-v\d+$/);
    expect(registry.PROMPT_BUNDLE_VERSION).toMatch(/^disciplan-prompts-v\d+$/);
    expect(registry.PROMPT_BUNDLE_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(registry.PROMPTS).sort()).toEqual(['coordinator', 'planner', 'repair', 'reviewer', 'tutor']);
  });

  it('fails closed when a model has no governed pricing', () => {
    expect(() => registry.getModelPricing('unpriced-model')).toThrow(/No governed pricing/);
  });

  it('governs every role model price', () => {
    expect(registry.getModelPricing('gemini-3.5-flash-lite').inputMicroUsdPerMillionTokens).toBeGreaterThan(0);
    expect(registry.getModelPricing('gemini-3.6-flash').outputMicroUsdPerMillionTokens).toBeGreaterThan(0);
  });
});
