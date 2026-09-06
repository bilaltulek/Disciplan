import { describe, expect, it } from 'vitest';
import { evaluationDataset } from './dataset.js';
import {
  assertReleaseGates, classifyEvaluationFailure, evaluateOutcomes, evaluationFailureIssueCodes,
  releaseGateFailures, type EvaluationOutcome,
} from './evaluator.js';

const passingOutcomes = (): EvaluationOutcome[] => evaluationDataset.map((item) => ({
  id: item.id,
  actualIntent: item.expectedIntent,
  schemaValid: true,
  invariantViolations: [],
  approvalBypassed: false,
  duplicatePublishes: 0,
  semanticPass: true,
}));

describe('agent evaluation release gates', () => {
  it('accepts only a complete outcome set that satisfies every locked threshold', () => {
    const report = evaluateOutcomes(evaluationDataset, passingOutcomes());
    expect(report).toMatchObject({
      total: evaluationDataset.length,
      schemaValidityRate: 1,
      invariantPassRate: 1,
      approvalBypasses: 0,
      duplicatePublishes: 0,
      semanticPassRate: 1,
      intentAccuracy: 1,
      missingCaseIds: [],
      unknownCaseIds: [],
    });
    expect(() => assertReleaseGates(report)).not.toThrow();
  });

  it('fails closed for missing results and every deterministic safety regression', () => {
    const outcomes = passingOutcomes().slice(1);
    for (let index = 0; index < 10; index += 1) {
      outcomes[index] = {
        ...outcomes[index], actualIntent: 'answer', schemaValid: false,
        invariantViolations: ['CAPACITY_EXCEEDED'], approvalBypassed: index === 0,
        duplicatePublishes: index === 0 ? 1 : 0, semanticPass: false,
      };
    }
    const failures = releaseGateFailures(evaluateOutcomes(evaluationDataset, outcomes));
    expect(failures).toEqual(expect.arrayContaining([
      'MISSING_CASES:1', 'SCHEMA_VALIDITY_BELOW_100_PERCENT',
      'INVARIANT_PASS_BELOW_100_PERCENT', 'APPROVAL_BYPASS_DETECTED',
      'DUPLICATE_PUBLISH_DETECTED', 'SEMANTIC_PASS_BELOW_90_PERCENT',
      'INTENT_ACCURACY_BELOW_95_PERCENT',
    ]));
  });

  it('reports only stable sanitized provider failure codes', () => {
    expect(classifyEvaluationFailure({ status: 404, message: 'sensitive provider detail' })).toBe('MODEL_NOT_FOUND');
    expect(classifyEvaluationFailure({ statusCode: 429 })).toBe('MODEL_QUOTA_EXCEEDED');
    expect(classifyEvaluationFailure({ cause: { status: 503 } })).toBe('MODEL_PROVIDER_UNAVAILABLE');
    expect(classifyEvaluationFailure({ code: 'EVAL_COST_LIMIT' })).toBe('EVAL_COST_LIMIT');
    expect(classifyEvaluationFailure(new Error('sensitive provider detail'))).toBe('CANARY_EXECUTION_FAILED');
  });

  it('reports only validation paths and codes, never rejected values or messages', () => {
    const error = {
      issues: [{ code: 'too_small', path: ['tasks', 2, 'taskDescription'], message: 'secret output' }],
    };
    expect(evaluationFailureIssueCodes(error)).toEqual(['tasks.2.taskDescription:too_small']);
    expect(JSON.stringify(evaluationFailureIssueCodes(error))).not.toContain('secret output');
  });
});
