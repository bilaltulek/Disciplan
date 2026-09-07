import { describe, expect, it } from 'vitest';
import { buildGeminiModelOptions, normalizeGoogleModelError } from './model-gateway.js';

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

describe('Gemini failure classification', () => {
  it.each([
    [{ name: 'PromptBlockedError' }, 'MODEL_SAFETY_BLOCK'],
    [{ name: 'RequestError', statusCode: 429 }, 'MODEL_QUOTA_EXCEEDED'],
    [{ name: 'RequestError', statusCode: 504 }, 'MODEL_TIMEOUT'],
    [{ name: 'RequestError', statusCode: 404 }, 'MODEL_NOT_FOUND'],
    [{ name: 'RequestError', statusCode: 400 }, 'MODEL_REQUEST_INVALID'],
  ])('maps provider failures without exposing provider response data', (input, code) => {
    expect(normalizeGoogleModelError(input)).toMatchObject({ code, message: 'The model request failed safely.' });
  });

  it('preserves governed application failure codes', () => {
    const failure = Object.assign(new Error('accounting failed'), { code: 'AI_USAGE_ACCOUNTING_FAILED' });
    expect(normalizeGoogleModelError(failure)).toBe(failure);
  });

  it('classifies nested Google request failures and retains only safe status metadata', () => {
    const normalized = normalizeGoogleModelError(Object.assign(new Error('wrapper'), {
      cause: { name: 'RequestError', statusCode: 429, data: { error: { message: 'private provider detail' } } },
    }));
    expect(normalized).toMatchObject({ code: 'MODEL_QUOTA_EXCEEDED', statusCode: 429 });
    expect(normalized.message).not.toContain('private provider detail');
  });
});
