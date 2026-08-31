import { describe, expect, it } from 'vitest';
import { buildGeminiModelOptions } from './model-gateway.js';

const base = {
  apiKey: 'test-only-key',
  modelName: 'gemini-3.5-flash-lite',
  maxOutputTokens: 600,
  thinkingBudget: 0,
};

describe('Gemini model options', () => {
  it('omits zero-valued thinking configuration for Gemini 3 compatibility', () => {
    expect(buildGeminiModelOptions(base)).not.toHaveProperty('thinkingConfig');
  });

  it('fails closed instead of sending a numeric thinking budget to Gemini 3', () => {
    expect(() => buildGeminiModelOptions({ ...base, thinkingBudget: 128 })).toThrowError(
      expect.objectContaining({ code: 'MODEL_THINKING_CONFIG_UNSUPPORTED' }),
    );
  });

  it('retains explicitly enabled numeric budgets for governed Gemini 2 models', () => {
    expect(buildGeminiModelOptions({ ...base, modelName: 'gemini-2.5-flash', thinkingBudget: 128 }))
      .toHaveProperty('thinkingConfig.thinkingBudget', 128);
  });
});
