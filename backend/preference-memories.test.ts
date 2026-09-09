import { describe, expect, it } from 'vitest';

const { validateMemory } = require('./preference-memories');

describe('preference memory validation', () => {
  it('accepts only bounded, explainable memory keys', () => {
    expect(validateMemory({ key: 'planning_style', value: 'Prefer lighter Fridays.' })).toBe(true);
    expect(validateMemory({ key: 'secret_token', value: 'capture this' })).toBe(false);
    expect(validateMemory({ key: 'planning_style', value: 'x'.repeat(501) })).toBe(false);
  });
});
