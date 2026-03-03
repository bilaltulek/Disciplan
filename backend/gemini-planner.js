const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config.env');
const {
  STATUS,
  extractUsageMetadata,
  estimateCostMicroUsd,
  getBudgetGuardDecision,
  recordAiUsageEvent,
} = require('./ai-usage');
const { detectSubject, getTasks, getEstimatedDuration } = require('./task-templates');

const model = config.geminiApiKey
  ? new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({ model: config.geminiModel })
  : null;

const safeRecordAiUsageEvent = async (payload) => {
  try {
    await recordAiUsageEvent(payload);
  } catch (error) {
    console.error('Failed to record AI usage event:', error.message);
  }
};

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
  const {
    title, description, complexity, dueDate, totalItems, userId,
  } = assignment;
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are an expert academic planner. Create a daily study schedule.

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
3. Return ONLY a valid JSON array.
4. Keep tasks practical and specific.`;

  const fallbackPlan = buildFallbackPlan(assignment);

  if (!model) {
    return { plan: fallbackPlan, source: 'fallback_error' };
  }

  try {
    const guardDecision = await getBudgetGuardDecision(userId);
    if (!guardDecision.allow) {
      await safeRecordAiUsageEvent({
        userId,
        endpoint: '/api/assignments',
        model: config.geminiModel,
        status: guardDecision.status,
      });
      return { plan: fallbackPlan, source: 'fallback_limit' };
    }
  } catch (error) {
    console.error('AI budget guard failed:', error.message);
    return { plan: fallbackPlan, source: 'fallback_error' };
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: config.aiMaxOutputTokens,
        thinkingConfig: {
          thinkingBudget: config.aiThinkingBudget,
        },
      },
    });
    const response = await result.response;
    let text = response.text();

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1) {
      throw new Error('Gemini did not return a valid JSON array.');
    }

    text = text.substring(firstBracket, lastBracket + 1);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error('Gemini response JSON is not an array.');
    }

    const usage = extractUsageMetadata(response);
    const estimatedCost = estimateCostMicroUsd({
      model: config.geminiModel,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
    });
    await safeRecordAiUsageEvent({
      userId,
      endpoint: '/api/assignments',
      model: config.geminiModel,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedInputMicroUsd: estimatedCost.estimatedInputMicroUsd,
      estimatedOutputMicroUsd: estimatedCost.estimatedOutputMicroUsd,
      estimatedTotalMicroUsd: estimatedCost.estimatedTotalMicroUsd,
      status: STATUS.allowed,
    });

    return { plan: parsed, source: 'gemini' };
  } catch (error) {
    console.error('Gemini Plan Generation Failed:', error);
    await safeRecordAiUsageEvent({
      userId,
      endpoint: '/api/assignments',
      model: config.geminiModel,
      status: STATUS.error,
    });
    return { plan: fallbackPlan, source: 'fallback_error' };
  }
}

module.exports = { generateStudyPlan };
