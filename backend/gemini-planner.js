const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// UPDATE: Use the specific version string
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // UPDATE: Robust JSON cleanup
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
        text = text.substring(firstBracket, lastBracket + 1);
        return JSON.parse(text);
    } else {
        console.error("Gemini did not return a valid JSON array:", text);
        return [];
    }

  } catch (error) {
    console.error("Gemini Plan Generation Failed:", error);
    return [];
  }
}

module.exports = { generateStudyPlan };