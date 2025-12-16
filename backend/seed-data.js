const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, 'study_planner.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Sample data for generating realistic assignments
const assignmentTitles = [
  'Research Paper on Machine Learning',
  'Calculus Problem Set Chapter 5',
  'History Essay: World War II',
  'Chemistry Lab Report',
  'Programming Project: Web Application',
  'Biology Presentation on Genetics',
  'Literature Analysis: Shakespeare',
  'Physics Problem Set: Thermodynamics',
  'Economics Case Study Analysis',
  'Spanish Vocabulary Quiz Prep',
  'Database Design Project',
  'Marketing Strategy Proposal',
  'Art History Final Paper',
  'Statistics Homework Assignment',
  'Philosophy Essay on Ethics'
];

const descriptions = [
  'Complete analysis and documentation required',
  'Read chapters and complete all exercises',
  'Minimum 2000 words with citations',
  'Lab work and detailed writeup',
  'Full stack application with documentation',
  ' 15-minute presentation with slides',
  'Critical analysis with examples',
  'Solve all problems showing work',
  'Research and present findings',
  'Study 50+ new words and phrases'
];

const complexityLevels = ['Easy', 'Medium', 'Hard'];

const taskTemplates = {
  'Easy': [
    'Review course notes and materials',
    'Create outline or structure',
    'Complete first draft',
    'Final review and submission'
  ],
  'Medium': [
    'Gather research materials and resources',
    'Read and take notes on key topics',
    'Create detailed outline',
    'Write first draft',
    'Review and edit content',
    'Finalize and proofread',
    'Submit assignment'
  ],
  'Hard': [
    'Conduct initial research and literature review',
    'Organize and categorize sources',
    'Create detailed project plan',
    'Work on first section/component',
    'Work on second section/component',
    'Work on third section/component',
    'Integration and testing',
    'Comprehensive review and editing',
    'Get feedback and revise',
    'Final polish and submission'
  ]
};

// Helper function to generate random date
function getRandomFutureDate(minDays, maxDays) {
  const today = new Date();
  const daysAhead = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + daysAhead);
  return futureDate.toISOString().split('T')[0];
}

function getRandomPastDate(maxDaysAgo) {
  const today = new Date();
  const daysAgo = Math.floor(Math.random() * maxDaysAgo);
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - daysAgo);
  return pastDate.toISOString().split('T')[0];
}

// Helper function to generate dates between two dates
function generateTaskDates(startDate, endDate, taskCount) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const dates = [];
  
  for (let i = 0; i < taskCount; i++) {
    const dayOffset = Math.floor((totalDays / (taskCount + 1)) * (i + 1));
    const taskDate = new Date(start);
    taskDate.setDate(start.getDate() + dayOffset);
    dates.push(taskDate.toISOString().split('T')[0]);
  }
  
  return dates;
}

// Helper function to get duration based on complexity
function getEstimatedDuration(complexity) {
  const durations = {
    'Easy': [30, 45, 60],
    'Medium': [60, 90, 120],
    'Hard': [120, 150, 180]
  };
  const options = durations[complexity];
  return options[Math.floor(Math.random() * options.length)];
}

// Insert sample assignments
function insertAssignments() {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO assignments (title, complexity, due_date, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const assignments = [];
    
    // Create 10 random assignments
    for (let i = 0; i < 10; i++) {
      const title = assignmentTitles[Math.floor(Math.random() * assignmentTitles.length)];
      const complexity = complexityLevels[Math.floor(Math.random() * complexityLevels.length)];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      const createdAt = getRandomPastDate(30);
      const dueDate = getRandomFutureDate(5, 45);
      
      assignments.push({ title, complexity, dueDate, description, createdAt });
      
      stmt.run(title, complexity, dueDate, description, createdAt, (err) => {
        if (err) {
          console.error('Error inserting assignment:', err.message);
        }
      });
    }

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`Inserted ${assignments.length} assignments`);
        resolve(assignments);
      }
    });
  });
}

// Insert study tasks for assignments
function insertStudyTasks() {
  return new Promise((resolve, reject) => {
    // Get all assignments
    db.all('SELECT * FROM assignments', [], (err, assignments) => {
      if (err) {
        reject(err);
        return;
      }

      const stmt = db.prepare(`
        INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, completed, estimated_duration)
        VALUES (?, ?, ?, ?, ?)
      `);

      let totalTasks = 0;

      assignments.forEach(assignment => {
        const tasks = taskTemplates[assignment.complexity];
        const taskDates = generateTaskDates(assignment.created_at, assignment.due_date, tasks.length);
        
        tasks.forEach((taskDesc, index) => {
          const scheduledDate = taskDates[index];
          const isCompleted = new Date(scheduledDate) < new Date() ? Math.random() > 0.3 : 0;
          const duration = getEstimatedDuration(assignment.complexity);
          
          stmt.run(
            assignment.id,
            taskDesc,
            scheduledDate,
            isCompleted ? 1 : 0,
            duration,
            (err) => {
              if (err) {
                console.error('Error inserting task:', err.message);
              }
            }
          );
          totalTasks++;
        });
      });

      stmt.finalize((err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Inserted ${totalTasks} study tasks`);
          resolve();
        }
      });
    });
  });
}

// Main execution
db.serialize(async () => {
  try {
    console.log('Starting data insertion...');
    await insertAssignments();
    await insertStudyTasks();
    console.log('Sample data inserted successfully!');
  } catch (err) {
    console.error('Error inserting data:', err.message);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
    });
  }
});