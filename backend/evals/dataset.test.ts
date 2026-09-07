import { describe, expect, it } from 'vitest';
import { evaluationDataset } from './dataset.js';

describe('agent regression dataset', () => {
  it('covers the planning baseline plus at least forty conversational cases', () => {
    expect(evaluationDataset.length).toBeGreaterThanOrEqual(100);
    expect(evaluationDataset.filter((item) => item.subject === 'conversation')).toHaveLength(40);
    expect(new Set(evaluationDataset.map((item) => item.subject)).size).toBeGreaterThanOrEqual(7);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'clarify')).toBe(true);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'repair_plan')).toBe(true);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'tutor')).toBe(true);
    expect(evaluationDataset.some((item) => item.expectedIntent === 'break_down_task')).toBe(true);
    expect(evaluationDataset.some((item) => item.adversarial)).toBe(true);
  });

  it('uses stable unique case IDs', () => {
    expect(new Set(evaluationDataset.map((item) => item.id)).size).toBe(evaluationDataset.length);
  });
});
