import type { DisciplanState } from './graph-state.js';

const planner = require('../gemini-planner');
const { allocateTasks } = require('../domain/scheduler');
const { todayInTimezone } = require('../domain/date-only');

export const fallbackDraft = (state: DisciplanState) => {
  if (!state.assignment) throw new Error('Assignment context is unavailable.');
  if (state.existingPlan.length) {
    const today = state.planningDate || todayInTimezone(state.planningProfile?.timezone || 'UTC');
    const completedIds = new Set(state.completedLogicalTaskIds);
    const overdue = state.existingPlan.filter((task) => !completedIds.has(task.logicalTaskId || '') && task.scheduledDate < today);
    const retainedLoad = { ...state.existingLoad };
    for (const task of state.existingPlan.filter((item) => !completedIds.has(item.logicalTaskId || '') && item.scheduledDate >= today)) {
      retainedLoad[task.scheduledDate] = (retainedLoad[task.scheduledDate] || 0) + task.estimatedMinutes;
    }
    const moved = allocateTasks({
      descriptions: overdue.map((task) => task.taskDescription),
      startDate: today,
      dueDate: state.assignment.dueDate,
      profile: state.planningProfile,
      existingLoad: retainedLoad,
    });
    const movedById = new Map(overdue.map((task, index) => [task.logicalTaskId, moved[index]]));
    return {
      tasks: state.existingPlan.map((task) => {
        const replacement = movedById.get(task.logicalTaskId);
        return replacement
          ? { ...task, scheduledDate: replacement.scheduled_date, estimatedMinutes: replacement.estimated_minutes }
          : task;
      }),
      rationale: moved.length === overdue.length
        ? 'A deterministic repair moved only overdue unfinished work and preserved completed and unaffected tasks.'
        : 'No deterministic repair could fit every overdue task; the unchanged plan is retained for safe validation failure.',
      assumptions: ['Completed tasks and their historical schedule remain immutable.'],
    };
  }
  const tasks = planner.buildFallbackPlan({
    ...state.assignment,
    planningProfile: state.planningProfile,
    existingLoad: state.existingLoad,
  });
  return {
    tasks: tasks.map((task: { task_description: string; scheduled_date: string; estimated_minutes: number }) => ({
      taskDescription: task.task_description,
      scheduledDate: task.scheduled_date,
      estimatedMinutes: task.estimated_minutes,
    })),
    rationale: 'A deterministic capacity-aware plan was used because model execution was unavailable or unsafe.',
    assumptions: ['The assignment workload is represented by the supplied item count.'],
  };
};
