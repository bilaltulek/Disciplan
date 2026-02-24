const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config.env');
const { detectSubject, getTasks, getEstimatedDuration } = require('./task-templates');

const model = config.geminiApiKey
  ? new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({ model: 'gemini-2.5-flash' })
  : null;

const toDateOnly = (date) => date.toISOString().split('T')[0];

const normalizeDate = (rawDate) => {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback;
  }
  return parsed;
};

const buildFallbackPlan = (assignment) => {
  const today = new Date();
  const due = normalizeDate(assignment.dueDate);
  const dueAtLeastTomorrow = new Date(Math.max(due.getTime(), today.getTime() + 24 * 60 * 60 * 1000));

  const subject = detectSubject(assignment.title, assignment.description);
  const templateTasks = getTasks(subject, assignment.complexity || 'Medium');
  const daySpan = Math.max(
    1,
    Math.ceil((dueAtLeastTomorrow.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return templateTasks.map((taskDescription, index) => {
    const dayOffset = Math.min(daySpan, index + 1);
    const scheduledDate = new Date(today);
    scheduledDate.setDate(today.getDate() + dayOffset);
    return {
      task_description: taskDescription,
      scheduled_date: toDateOnly(scheduledDate),
      estimated_minutes: getEstimatedDuration(subject, assignment.complexity || 'Medium'),
    };
  });
};

async function generateStudyPlan(assignment) {
  const { title, description, complexity, dueDate, totalItems } = assignment;
  const today = new Date().toISOString().split('T')[0];

  const prompt = `
    You are an expert academic planner. Create a daily study schedule.

    CONTEXT:
    - Assignment: "${title}"
    - Description: "${description}"
    - Complexity: ${complexity} (1-5)
    - Total Workload: ${totalItems} items (problems, pages, or sections)
    - Start Date: ${today}
    - Due Date: ${dueDate}

    INSTRUCTIONS:
    1. Calculate the number of days available between today and the due date.
    2. Break the workload down intelligently.
       - If it's a "Hard" math assignment, schedule fewer problems per day.
       - If it's a writing assignment, split it into Outline -> Draft -> Review.
       - Ensure the last day is reserved for "Final Review".
    3. Return ONLY a valid JSON array. Do not include markdown formatting or backticks.

    JSON FORMAT:
    [
      {
        "task_description": "Specific action item (e.g. 'Solve problems 1-3')",
        "scheduled_date": "YYYY-MM-DD",
        "estimated_minutes": 45
      }
    ]
  `;

  try {
    if (!model) {
      return buildFallbackPlan(assignment);
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1) {
      text = text.substring(firstBracket, lastBracket + 1);
      return JSON.parse(text);
    }

    console.error('Gemini did not return a valid JSON array:', text);
    return buildFallbackPlan(assignment);
  } catch (error) {
    console.error('Gemini Plan Generation Failed:', error);
    return buildFallbackPlan(assignment);
  }
}

module.exports = { generateStudyPlan };
