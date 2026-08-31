import { describe, expect, it } from 'vitest';
import { evaluationDataset } from './dataset.js';

describe('agent regression dataset', () => {
  it('covers at least sixty varied and adversarial cases', () => {
    expect(evaluationDataset.length).toBeGreaterThanOrEqual(60);
    expect(new Set(evaluationDataset.map((item) => item.subject)).size).toBeGreaterThanOrEqual(7);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'clarify')).toBe(true);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'repair')).toBe(true);
    expect(evaluationDataset.some((item) => item.adversarial)).toBe(true);
  });

  it('uses stable unique case IDs', () => {
    expect(new Set(evaluationDataset.map((item) => item.id)).size).toBe(evaluationDataset.length);
  });
});
