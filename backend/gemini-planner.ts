const { getAssignmentTasks } = require('./task-templates');
const { allocateTasks } = require('./domain/scheduler');
const { todayInTimezone } = require('./domain/date-only');

// Compatibility module for deterministic planning. Production model access
// lives exclusively behind backend/agents/model-gateway.ts.
const buildFallbackPlan = (assignment: any) => {
  const classification = getAssignmentTasks({
    title: assignment.title,
    description: assignment.description,
    complexity: assignment.complexity || 'Medium',
  });
  const profile = assignment.planningProfile;
  const timezone = profile?.timezone || 'UTC';
  const startDate = assignment.startDate || todayInTimezone(timezone);
  return allocateTasks({
    descriptions: classification.tasks,
    startDate,
    dueDate: assignment.dueDate,
    profile,
    existingLoad: assignment.existingLoad,
  });
};

// Retained for the reviewer data-boundary regression test. It does not invoke
// a model and is not part of the active graph prompt bundle.
const buildReviewPrompt = ({ assignment, tasks, validationIssues }: any) => {
  const reviewInput = {
    assignment: {
      title: assignment.title,
      complexity: assignment.complexity,
      dueDate: assignment.dueDate,
      totalItems: assignment.totalItems,
    },
    tasks,
    deterministicIssues: validationIssues,
  };
  return `Review ONLY this structured plan data. Do not add user data or perform actions.\n\n${JSON.stringify(reviewInput)}`;
};

module.exports = { buildFallbackPlan, buildReviewPrompt };
