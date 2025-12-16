const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your_super_secret_key_123';
require('dotenv').config();

const db = require('./database');
const { generateStudyPlan } = require('./gemini-planner');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());


// Middleware to check if user is logged in
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN_HERE

  if (!token) return res.sendStatus(401); // No token? Get out.

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403); // Invalid token? Get out.
    req.user = user; // Save user info for the next step
    next();
  });
};


// ------------------------------------------
// A. REGISTER USER
// ------------------------------------------
app.post('/api/register', (req, res) => {
  const { email, password, name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);

  db.run(`INSERT INTO users (email, password, name) VALUES (?, ?, ?)`, 
    [email, hashedPassword, name], 
    function(err) {
      if (err) return res.status(500).json({ error: "Email already exists." });
      
      // Auto-login after register
      const token = jwt.sign({ id: this.lastID }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ token, user: { id: this.lastID, email, name } });
    }
  );
});

// ------------------------------------------
// B. LOGIN USER
// ------------------------------------------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "User not found." });

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid password." });

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });
});

// ------------------------------------------
// 1. GET ALL ASSIGNMENTS (Protected & User Specific)
// ------------------------------------------
app.get('/api/assignments', authenticateToken, (req, res) => {
  const userId = req.user.id; // Get ID from the token
  
  const sql = `
    SELECT 
      a.*,
      COUNT(t.id) as total_subtasks,
      SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) as completed_subtasks
    FROM assignments a
    LEFT JOIN study_tasks t ON a.id = t.assignment_id
    WHERE a.user_id = ?  
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `;
  
  // We pass userId into the query so we ONLY get this user's rows
  db.all(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ------------------------------------------
// 2. CREATE ASSIGNMENT (Protected)
// ------------------------------------------
app.post('/api/assignments', authenticateToken, async (req, res) => {
  const { title, complexity, dueDate, description, totalItems } = req.body;
  const userId = req.user.id; // Get ID from the token

  const sqlInsert = `INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description) VALUES (?, ?, ?, ?, ?, ?)`;
  
  db.run(sqlInsert, [userId, title, complexity, dueDate, totalItems, description], async function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const assignmentId = this.lastID;
    
    // AI PLANNER (Same as before)
    try {
      const plan = await generateStudyPlan({ title, complexity, dueDate, description, totalItems });
      if (plan.length > 0) {
        const stmt = db.prepare(`INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, estimated_minutes) VALUES (?, ?, ?, ?)`);
        plan.forEach(task => {
          stmt.run(assignmentId, task.task_description, task.scheduled_date, task.estimated_minutes);
        });
        stmt.finalize();
      }
      res.status(201).json({ message: 'Assignment created', id: assignmentId });
    } catch (aiError) {
      res.status(500).json({ error: "Saved, but AI failed." });
    }
  });
});

// ------------------------------------------
// 3. GET ASSIGNMENT PLAN (Strict Ownership Check)
// ------------------------------------------
app.get('/api/assignment/plan/:id', authenticateToken, (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.id;

  const sql = `
    SELECT study_tasks.* FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.assignment_id = ? AND assignments.user_id = ?
    ORDER BY study_tasks.scheduled_date ASC
  `;

  db.all(sql, [assignmentId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // If no rows found, it might mean empty plan OR access denied. 
    // In strict production, you might check for assignment existence first, 
    // but this query is safe: it returns nothing if you don't own it.
    res.json(rows);
  });
});

// ------------------------------------------
// 4. GET TIMELINE (Protected)
// ------------------------------------------
app.get('/api/timeline', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT 
      study_tasks.*,
      assignments.title as assignment_title, 
      assignments.complexity 
    FROM study_tasks 
    JOIN assignments ON study_tasks.assignment_id = assignments.id 
    WHERE assignments.user_id = ?
    ORDER BY study_tasks.scheduled_date ASC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ------------------------------------------
// 5. GET HISTORY (Protected)
// ------------------------------------------
app.get('/api/history', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT 
      study_tasks.*,
      assignments.title as assignment_title,
      assignments.complexity
    FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.completed = 1 AND assignments.user_id = ?
    ORDER BY study_tasks.scheduled_date DESC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ------------------------------------------
// 6. TOGGLE TASK COMPLETION (Strict Ownership Check)
// ------------------------------------------
app.patch('/api/tasks/:id/toggle', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const { completed } = req.body;
  const userId = req.user.id;

  // Complex Query: Update the task ONLY IF it links to an assignment owned by this user
  const sql = `
    UPDATE study_tasks 
    SET completed = ? 
    WHERE id = ? 
    AND assignment_id IN (
        SELECT id FROM assignments WHERE user_id = ?
    )
  `;
  
  db.run(sql, [completed ? 1 : 0, taskId, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
        // If changes is 0, it means either task didn't exist OR you don't own it.
        return res.status(403).json({ error: "Access denied or task not found." });
    }
    res.json({ message: "Task updated", changes: this.changes });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});