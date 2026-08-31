const MAX_TASKS = 120;
const { parseDateOnly, todayInTimezone } = require('./domain/date-only');
const { normalizeProfile } = require('./domain/scheduler');
const { validateFocusTopicCoverage } = require('./domain/content-alignment');

const validatePlan = ({ tasks, assignment, profile, existingLoad = {}, today, completedLogicalTaskIds = [] }) => {
  const issues = [];
  if (!Array.isArray(tasks) || tasks.length === 0) return ['A study plan must contain at least one task.'];
  if (tasks.length > MAX_TASKS) issues.push(`A plan may not contain more than ${MAX_TASKS} tasks.`);

  const dueDate = parseDateOnly(assignment.due_date || assignment.dueDate);
  const normalizedProfile = normalizeProfile(profile);
  const currentDate = parseDateOnly(today || todayInTimezone(normalizedProfile.timezone));
  let totalMinutes = 0;
  const dailyMinutes = new Map(Object.entries(existingLoad).map(([date, minutes]) => [date, Number(minutes)]));
  const completedIds = new Set(completedLogicalTaskIds);

  tasks.forEach((task, index) => {
    if (typeof task?.task_description !== 'string' || task.task_description.trim().length < 3 || task.task_description.length > 500) {
      issues.push(`Task ${index + 1} must have a 3-500 character description.`);
    }
    const scheduled = parseDateOnly(task?.scheduled_date);
    if (!scheduled) {
      issues.push(`Task ${index + 1} must have a YYYY-MM-DD scheduled date.`);
    } else {
      if (currentDate && scheduled.ordinal < currentDate.ordinal && !completedIds.has(task.logical_task_id || task.logicalTaskId)) issues.push(`Task ${index + 1} cannot be scheduled in the past.`);
      if (dueDate && scheduled.ordinal > dueDate.ordinal) issues.push(`Task ${index + 1} cannot be scheduled after the assignment due date.`);
    }
    if (!Number.isInteger(task?.estimated_minutes) || task.estimated_minutes < 1 || task.estimated_minutes > 720) {
      issues.push(`Task ${index + 1} must have a duration between 1 and 720 minutes.`);
    } else {
      totalMinutes += task.estimated_minutes;
      if (scheduled && !completedIds.has(task.logical_task_id || task.logicalTaskId)) dailyMinutes.set(task.scheduled_date, (dailyMinutes.get(task.scheduled_date) || 0) + task.estimated_minutes);
    }
  });

  if (totalMinutes > 720 * 14) issues.push('The generated workload exceeds the safety limit for a single plan.');
  if (profile) {
    for (const [date, minutes] of dailyMinutes) {
      const dayLimit = Math.min(
        Number(normalizedProfile.weekdayAvailableMinutes[new Date(`${date}T00:00:00.000Z`).getUTCDay()] || 0),
        normalizedProfile.maxDailyMinutes,
      );
      if (minutes > dayLimit) issues.push(`The plan exceeds the ${dayLimit}-minute capacity on ${date}.`);
    }
  }
  issues.push(...validateFocusTopicCoverage({ assignment, tasks }));
  return issues;
};

module.exports = { validatePlan };
