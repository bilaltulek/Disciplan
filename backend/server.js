const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = require('./config.env');
const db = require('./database');
const { generateStudyPlan } = require('./gemini-planner');
const { authenticateToken } = require('./middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateAssignment,
  validateIdParam,
  validateTaskToggle,
} = require('./middleware/validate');

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

const authAttempts = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 20;

const authRateLimiter = (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const attempt = authAttempts.get(key) || { count: 0, start: now };

  if (now - attempt.start > AUTH_WINDOW_MS) {
    authAttempts.set(key, { count: 1, start: now });
    return next();
  }

  if (attempt.count >= AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  }

  attempt.count += 1;
  authAttempts.set(key, attempt);
  return next();
};

const issueToken = (userId) => jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '24h' });

const setAuthCookie = (res, token) => {
  const secure = config.isProduction ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400;${secure}`);
};

app.post('/api/register', authRateLimiter, validateRegister, (req, res) => {
  const { email, password, name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 12);

  db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', [email, hashedPassword, name], function onInsert(err) {
    if (err) {
      return res.status(409).json({ error: 'Account could not be created.' });
    }

    const token = issueToken(this.lastID);
    setAuthCookie(res, token);
    return res.json({ user: { id: this.lastID, email, name } });
  });
});

app.post('/api/login', authRateLimiter, validateLogin, (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials.' });

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = issueToken(user.id);
    setAuthCookie(res, token);
    return res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });
});

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;');
  res.json({ message: 'Logged out.' });
});

app.get('/api/me', authenticateToken, (req, res) => {
  db.get('SELECT id, email, name FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user });
  });
});

app.get('/api/assignments', authenticateToken, (req, res) => {
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

  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.post('/api/assignments', authenticateToken, validateAssignment, async (req, res) => {
  const {
    title, complexity, dueDate, description, totalItems,
  } = req.body;

  const sqlInsert = 'INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description) VALUES (?, ?, ?, ?, ?, ?)';

  db.run(sqlInsert, [req.user.id, title, complexity, dueDate, totalItems, description], async function onInsert(err) {
    if (err) return res.status(500).json({ error: err.message });

    const assignmentId = this.lastID;

    try {
      const plan = await generateStudyPlan({
        title,
        complexity,
        dueDate,
        description,
        totalItems,
      });

      if (plan.length > 0) {
        const stmt = db.prepare('INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, estimated_minutes) VALUES (?, ?, ?, ?)');
        plan.forEach((task) => {
          stmt.run(assignmentId, task.task_description, task.scheduled_date, task.estimated_minutes);
        });
        stmt.finalize();
      }

      return res.status(201).json({ message: 'Assignment created', id: assignmentId });
    } catch (_aiError) {
      return res.status(500).json({ error: 'Saved, but AI failed.' });
    }
  });
});

app.get('/api/assignment/plan/:id', authenticateToken, validateIdParam, (req, res) => {
  const sql = `
    SELECT study_tasks.* FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.assignment_id = ? AND assignments.user_id = ?
    ORDER BY study_tasks.scheduled_date ASC
  `;

  db.all(sql, [req.params.id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.get('/api/timeline', authenticateToken, (req, res) => {
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

  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.get('/api/history', authenticateToken, (req, res) => {
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

  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows);
  });
});

app.patch('/api/tasks/:id/toggle', authenticateToken, validateIdParam, validateTaskToggle, (req, res) => {
  const sql = `
    UPDATE study_tasks
    SET completed = ?
    WHERE id = ?
    AND assignment_id IN (
      SELECT id FROM assignments WHERE user_id = ?
    )
  `;

  db.run(sql, [req.body.completed ? 1 : 0, req.params.id, req.user.id], function onUpdate(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
      return res.status(403).json({ error: 'Access denied or task not found.' });
    }
    return res.json({ message: 'Task updated', changes: this.changes });
  });
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
