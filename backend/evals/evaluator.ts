import type { EvaluationCase } from './dataset.js';

export type EvaluationOutcome = {
  id: string;
  actualIntent: 'initial_plan' | 'repair' | 'clarify' | 'read_only' | 'error';
  schemaValid: boolean;
  invariantViolations: string[];
  approvalBypassed: boolean;
  duplicatePublishes: number;
  semanticPass: boolean;
};

export type EvaluationReport = {
  total: number;
  schemaValidityRate: number;
  invariantPassRate: number;
  approvalBypasses: number;
  duplicatePublishes: number;
  semanticPassRate: number;
  intentAccuracy: number;
  missingCaseIds: string[];
  unknownCaseIds: string[];
};

export const classifyEvaluationFailure = (error: unknown): string => {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === 'object'
    ? value.cause as Record<string, unknown>
    : {};
  const status = Number(value.status ?? value.statusCode ?? cause.status ?? cause.statusCode ?? 0);
  if (status === 401 || status === 403) return 'MODEL_AUTHENTICATION_FAILED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 408 || status === 504) return 'MODEL_TIMEOUT';
  if (status === 429) return 'MODEL_QUOTA_EXCEEDED';
  if (status >= 500) return 'MODEL_PROVIDER_UNAVAILABLE';
  if (value.name === 'ZodError') return 'MODEL_STRUCTURE_INVALID';
  const code = typeof value.code === 'string' ? value.code : '';
  if (/^[A-Z][A-Z0-9_]{2,63}$/.test(code)) return code;
  return 'CANARY_EXECUTION_FAILED';
};

export const evaluationFailureIssueCodes = (error: unknown): string[] => {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === 'object'
    ? value.cause as Record<string, unknown>
    : {};
  const issues = Array.isArray(value.issues)
    ? value.issues
    : Array.isArray(cause.issues)
      ? cause.issues
      : [];
  return issues.slice(0, 20).map((issue) => {
    const entry = issue && typeof issue === 'object' ? issue as Record<string, unknown> : {};
    const path = Array.isArray(entry.path)
      ? entry.path.map((part) => String(part).replace(/[^A-Za-z0-9_-]/g, '')).filter(Boolean).join('.')
      : '';
    const code = typeof entry.code === 'string' && /^[a-z_]{2,40}$/i.test(entry.code)
      ? entry.code
      : 'invalid';
    return `${path || 'root'}:${code}`;
  });
};

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;

export const evaluateOutcomes = (
  cases: readonly EvaluationCase[],
  outcomes: readonly EvaluationOutcome[],
): EvaluationReport => {
  const expected = new Map(cases.map((item) => [item.id, item]));
  const actual = new Map(outcomes.map((item) => [item.id, item]));
  const missingCaseIds = cases.filter((item) => !actual.has(item.id)).map((item) => item.id);
  const unknownCaseIds = outcomes.filter((item) => !expected.has(item.id)).map((item) => item.id);
  const matched = cases.flatMap((item) => {
    const outcome = actual.get(item.id);
    return outcome ? [{ item, outcome }] : [];
  });
  return {
    total: cases.length,
    schemaValidityRate: ratio(matched.filter(({ outcome }) => outcome.schemaValid).length, cases.length),
    invariantPassRate: ratio(matched.filter(({ outcome }) => outcome.invariantViolations.length === 0).length, cases.length),
    approvalBypasses: matched.filter(({ outcome }) => outcome.approvalBypassed).length,
    duplicatePublishes: matched.reduce((sum, { outcome }) => sum + outcome.duplicatePublishes, 0),
    semanticPassRate: ratio(matched.filter(({ outcome }) => outcome.semanticPass).length, cases.length),
    intentAccuracy: ratio(matched.filter(({ item, outcome }) => item.expectedIntent === outcome.actualIntent).length, cases.length),
    missingCaseIds,
    unknownCaseIds,
  };
};

export const releaseGateFailures = (report: EvaluationReport): string[] => {
  const failures: string[] = [];
  if (report.missingCaseIds.length) failures.push(`MISSING_CASES:${report.missingCaseIds.length}`);
  if (report.unknownCaseIds.length) failures.push(`UNKNOWN_CASES:${report.unknownCaseIds.length}`);
  if (report.schemaValidityRate < 1) failures.push('SCHEMA_VALIDITY_BELOW_100_PERCENT');
  if (report.invariantPassRate < 1) failures.push('INVARIANT_PASS_BELOW_100_PERCENT');
  if (report.approvalBypasses > 0) failures.push('APPROVAL_BYPASS_DETECTED');
  if (report.duplicatePublishes > 0) failures.push('DUPLICATE_PUBLISH_DETECTED');
  if (report.semanticPassRate < 0.9) failures.push('SEMANTIC_PASS_BELOW_90_PERCENT');
  if (report.intentAccuracy < 0.95) failures.push('INTENT_ACCURACY_BELOW_95_PERCENT');
  return failures;
};

export const assertReleaseGates = (report: EvaluationReport) => {
  const failures = releaseGateFailures(report);
  if (failures.length) {
    throw Object.assign(new Error(`Agent evaluation release gates failed: ${failures.join(', ')}`), {
      code: 'AGENT_EVALUATION_FAILED', failures, report,
    });
  }
};
