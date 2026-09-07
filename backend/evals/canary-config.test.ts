import { describe, expect, it } from 'vitest';
import { evaluationDataset } from './dataset.js';
import { resolveCanarySelection } from './canary-config.js';

describe('agent canary configuration', () => {
  it('treats only the complete unfiltered dataset as release evidence', () => {
    const complete = resolveCanarySelection(evaluationDataset, {});
    expect(complete.cases).toHaveLength(evaluationDataset.length);
    expect(complete.isCompleteReleaseRun).toBe(true);

    const limited = resolveCanarySelection(evaluationDataset, { AGENT_EVAL_LIMIT: '1' });
    expect(limited.cases).toHaveLength(1);
    expect(limited.isCompleteReleaseRun).toBe(false);
  });

  it('selects one named diagnostic case and supports pacing', () => {
    const selection = resolveCanarySelection(evaluationDataset, {
      AGENT_EVAL_CASE_ID: 'writing-0-medium',
      AGENT_EVAL_DELAY_MS: '1250',
    });
    expect(selection.cases.map((item) => item.id)).toEqual(['writing-0-medium']);
    expect(selection.delayMs).toBe(1250);
    expect(selection.isCompleteReleaseRun).toBe(false);
  });

  it('fails closed for unknown cases and invalid numeric settings', () => {
    expect(() => resolveCanarySelection(evaluationDataset, { AGENT_EVAL_CASE_ID: 'missing' }))
      .toThrow(/Unknown agent evaluation case/);
    expect(() => resolveCanarySelection(evaluationDataset, { AGENT_EVAL_DELAY_MS: '-1' }))
      .toThrow(/non-negative integers/);
  });
});
