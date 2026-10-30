import crypto from 'node:crypto';
import { PlanDraftSchema, type PlanDraft, type PlanTaskInput } from '../../shared/contracts.js';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const proposalHash = (draft: PlanDraft) => crypto
  .createHash('sha256')
  .update(canonicalJson(draft))
  .digest('hex');

const deterministicTaskId = (assignmentId: number, task: PlanTaskInput, ordinal: number) => {
  const hex = crypto.createHash('sha256')
    .update(canonicalJson({ assignmentId, ordinal, task }))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const normalizeDraft = (assignmentId: number, input: unknown): PlanDraft => {
  const parsed = PlanDraftSchema.parse(input);
  return {
    ...parsed,
    tasks: parsed.tasks.map((task, ordinal) => ({
      ...task,
      logicalTaskId: task.logicalTaskId ?? deterministicTaskId(assignmentId, task, ordinal),
    })),
  };
};

export const comparePlanTasks = (before: PlanTaskInput[], after: PlanTaskInput[]) => {
  const oldById = new Map(before.map((task) => [task.logicalTaskId, task]));
  const newById = new Map(after.map((task) => [task.logicalTaskId, task]));
  return {
    added: after.filter((task) => !oldById.has(task.logicalTaskId)),
    archived: before.filter((task) => !newById.has(task.logicalTaskId)),
    moved: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old && old.scheduledDate !== task.scheduledDate;
    }),
    edited: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old && (old.taskDescription !== task.taskDescription || old.estimatedMinutes !== task.estimatedMinutes);
    }),
    retained: after.filter((task) => {
      const old = oldById.get(task.logicalTaskId);
      return old
        && old.scheduledDate === task.scheduledDate
        && old.taskDescription === task.taskDescription
        && old.estimatedMinutes === task.estimatedMinutes;
    }),
  };
};
