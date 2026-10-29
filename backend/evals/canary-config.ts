import type { EvaluationCase } from './dataset.js';

const parseNonNegativeInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error('Agent evaluation numeric settings must be non-negative integers.'), {
      code: 'INVALID_EVALUATION_CONFIG',
    });
  }
  return parsed;
};

export const resolveCanarySelection = (
  dataset: readonly EvaluationCase[],
  environment: NodeJS.ProcessEnv,
) => {
  const requestedCaseId = environment.AGENT_EVAL_CASE_ID?.trim() || null;
  const selectedById = requestedCaseId
    ? dataset.filter((item) => item.id === requestedCaseId)
    : [...dataset];
  if (requestedCaseId && selectedById.length === 0) {
    throw Object.assign(new Error(`Unknown agent evaluation case: ${requestedCaseId}`), {
      code: 'UNKNOWN_EVALUATION_CASE',
    });
  }

  const requestedLimit = parseNonNegativeInteger(environment.AGENT_EVAL_LIMIT, dataset.length);
  const limit = Math.min(selectedById.length, Math.max(1, requestedLimit));
  const cases = selectedById.slice(0, limit);
  return {
    cases,
    delayMs: parseNonNegativeInteger(environment.AGENT_EVAL_DELAY_MS, 0),
    isCompleteReleaseRun: !requestedCaseId && cases.length === dataset.length,
  };
};

export const waitForCanaryPacing = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};
