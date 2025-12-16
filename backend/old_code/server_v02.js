const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const { detectSubject, getTasks, getEstimatedDuration } = require('./task-templates');
const corsOptions = {
  origin: 'http://localhost:8080', // Allow requests from frontend server
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const dbPath = path.join(__dirname, 'study_planner.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Helper function to generate study tasks based on complexity


/* Helper function to get estimated duration based on complexity
function getEstimatedDuration(complexity, taskIndex, totalTasks) {
  const durations = {
    'Easy': [30, 45, 60],
    'Medium': [60, 90, 120],
    'Hard': [120, 150, 180]
  };
  const options = durations[complexity];
  return options[Math.floor(Math.random() * options.length)];
}
  */

// Helper function to generate task dates between now and due date
function generateTaskDates(dueDate, taskCount) {
  const now = new Date();
  const end = new Date(dueDate);
  const totalDays = Math.floor((end - now) / (1000 * 60 * 60 * 24));
  
  if (totalDays < 1) {
    // If due date is today or past, spread tasks over the remaining hours or next day
    return Array(taskCount).fill(now.toISOString().split('T')[0]);
  }
  
  const dates = [];
  
  for (let i = 0; i < taskCount; i++) {
    const dayOffset = Math.floor((totalDays / (taskCount + 1)) * (i + 1));
    const taskDate = new Date(now);
    taskDate.setDate(now.getDate() + dayOffset);
    dates.push(taskDate.toISOString().split('T')[0]);
  }
  
  return dates;
}

// POST /api/assignments - Create a new assignment
app.post('/api/assignments', (req, res) => {
  const { title, complexity, due_date, description } = req.body;

  // Validation
  if (!title || !complexity || !due_date) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['title', 'complexity', 'due_date']
    });
  }

  // Validate complexity
  const validComplexities = ['Easy', 'Medium', 'Hard'];
  if (!validComplexities.includes(complexity)) {
    return res.status(400).json({
      error: 'Invalid complexity',
      allowed: validComplexities
    });
  }

  // Validate due_date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(due_date)) {
    return res.status(400).json({
      error: 'Invalid date format',
      expected: 'YYYY-MM-DD'
    });
  }

  // Check if due_date is in the future
  const dueDate = new Date(due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (dueDate < today) {
    return res.status(400).json({
      error: 'Due date must be today or in the future'
    });
  }

  const subject = detectSubject(title, description);

  // Insert assignment
  const insertAssignment = `
    INSERT INTO assignments (title, complexity, due_date, description)
    VALUES (?, ?, ?, ?)
  `;

  db.run(insertAssignment, [title, complexity, due_date, description || null], function(err) {
    if (err) {
      console.error('Error inserting assignment:', err.message);
      return res.status(500).json({ error: 'Failed to create assignment' });
    }

    const assignmentId = this.lastID;

    // Generate study tasks based on complexity
    const tasks = getTasks(subject, complexity);
    const taskDates = generateTaskDates(due_date, tasks.length);

    const insertTask = `
      INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, estimated_duration)
      VALUES (?, ?, ?, ?)
    `;

    const stmt = db.prepare(insertTask);
    let tasksInserted = 0;
    let taskErrors = [];

    tasks.forEach((taskDesc, index) => {
      const scheduledDate = taskDates[index];
      const duration = getEstimatedDuration(subject, complexity);

      stmt.run(assignmentId, taskDesc, scheduledDate, duration, (err) => {
        if (err) {
          taskErrors.push(err.message);
        } else {
          tasksInserted++;
        }

        // Check if all tasks have been processed
        if (tasksInserted + taskErrors.length === tasks.length) {
          stmt.finalize();

          if (taskErrors.length > 0) {
            console.error('Some tasks failed to insert:', taskErrors);
          }

          // Fetch the complete assignment with tasks
          db.get(
            'SELECT * FROM assignments WHERE id = ?',
            [assignmentId],
            (err, assignment) => {
              if (err) {
                return res.status(500).json({ error: 'Assignment created but failed to retrieve' });
              }

              db.all(
                'SELECT * FROM study_tasks WHERE assignment_id = ? ORDER BY scheduled_date',
                [assignmentId],
                (err, studyTasks) => {
                  if (err) {
                    return res.status(500).json({ 
                      error: 'Assignment created but failed to retrieve tasks',
                      assignment
                    });
                  }

                  res.status(201).json({
                    message: 'Assignment created successfully',
                    assignment: {
                      ...assignment,
                      study_tasks: studyTasks
                    }
                  });
                }
              );
            }
          );
        }
      });
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/assignments`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('\nDatabase connection closed');
    }
    process.exit(0);
  });
});