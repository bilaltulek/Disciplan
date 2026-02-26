const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = require('./config.env');
const db = require('./db');
const { generateStudyPlan } = require('./gemini-planner');
const { authenticateToken } = require('./middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateAssignment,
  validateIdParam,
  validateTaskToggle,
  validateTaskUpdate,
  validateSettingsPatch,
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
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

const defaultSettings = {
  theme_mode: 'light',
  start_page: 'dashboard',
  assignment_default_complexity: 'Medium',
  assignment_default_items: 5,
  confirm_assignment_delete: true,
};

const normalizeSettings = (row) => ({
  theme_mode: row?.theme_mode || defaultSettings.theme_mode,
  start_page: row?.start_page || defaultSettings.start_page,
  assignment_default_complexity: row?.assignment_default_complexity || defaultSettings.assignment_default_complexity,
  assignment_default_items: Number.parseInt(row?.assignment_default_items, 10) || defaultSettings.assignment_default_items,
  confirm_assignment_delete: row?.confirm_assignment_delete === undefined
    ? defaultSettings.confirm_assignment_delete
    : !!row.confirm_assignment_delete,
});

const ensureUserSettings = async (userId) => {
  await db.query(
    `INSERT INTO user_settings (
      user_id,
      theme_mode,
      start_page,
      assignment_default_complexity,
      assignment_default_items,
      confirm_assignment_delete
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO NOTHING`,
    [
      userId,
      defaultSettings.theme_mode,
      defaultSettings.start_page,
      defaultSettings.assignment_default_complexity,
      defaultSettings.assignment_default_items,
      defaultSettings.confirm_assignment_delete,
    ],
  );
};

const withErrorBoundary = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
};

app.post('/api/register', authRateLimiter, validateRegister, withErrorBoundary(async (req, res) => {
  const { email, password, name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 12);

  try {
    const result = await db.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, hashedPassword, name],
    );
    const user = result.rows[0];
    await ensureUserSettings(user.id);
    const token = issueToken(user.id);
    setAuthCookie(res, token);
    return res.json({ user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account could not be created.' });
    }
    throw error;
  }
}));

app.post('/api/login', authRateLimiter, validateLogin, withErrorBoundary(async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const isValid = bcrypt.compareSync(password, user.password);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = issueToken(user.id);
  setAuthCookie(res, token);
  return res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;');
  res.json({ message: 'Logged out.' });
});

app.get('/api/me', authenticateToken, withErrorBoundary(async (req, res) => {
  const result = await db.query('SELECT id, email, name FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
}));

app.get('/api/settings', authenticateToken, withErrorBoundary(async (req, res) => {
  await ensureUserSettings(req.user.id);
  const result = await db.query(
    `SELECT
      theme_mode,
      start_page,
      assignment_default_complexity,
      assignment_default_items,
      confirm_assignment_delete
    FROM user_settings
    WHERE user_id = $1`,
    [req.user.id],
  );
  return res.json({ settings: normalizeSettings(result.rows[0]) });
}));

app.patch('/api/settings', authenticateToken, validateSettingsPatch, withErrorBoundary(async (req, res) => {
  await ensureUserSettings(req.user.id);

  const existing = await db.query(
    `SELECT
      theme_mode,
      start_page,
      assignment_default_complexity,
      assignment_default_items,
      confirm_assignment_delete
    FROM user_settings
    WHERE user_id = $1`,
    [req.user.id],
  );

  const merged = {
    ...normalizeSettings(existing.rows[0]),
    ...Object.fromEntries(
      Object.entries(req.body).filter(([, value]) => value !== undefined),
    ),
  };

  await db.query(
    `UPDATE user_settings
    SET theme_mode = $1,
        start_page = $2,
        assignment_default_complexity = $3,
        assignment_default_items = $4,
        confirm_assignment_delete = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $6`,
    [
      merged.theme_mode,
      merged.start_page,
      merged.assignment_default_complexity,
      merged.assignment_default_items,
      merged.confirm_assignment_delete,
      req.user.id,
    ],
  );

  return res.json({ settings: merged });
}));

app.get('/api/assignments', authenticateToken, withErrorBoundary(async (req, res) => {
  const sql = `
    SELECT
      a.*,
      COUNT(t.id)::int AS total_subtasks,
      COALESCE(SUM(CASE WHEN t.completed = true THEN 1 ELSE 0 END), 0)::int AS completed_subtasks
    FROM assignments a
    LEFT JOIN study_tasks t ON a.id = t.assignment_id
    WHERE a.user_id = $1
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `;
  const result = await db.query(sql, [req.user.id]);
  return res.json(result.rows);
}));

app.post('/api/assignments', authenticateToken, validateAssignment, withErrorBoundary(async (req, res) => {
  const {
    title, complexity, dueDate, description, totalItems,
  } = req.body;

  const insertResult = await db.query(
    'INSERT INTO assignments (user_id, title, complexity, due_date, total_items, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [req.user.id, title, complexity, dueDate, totalItems, description],
  );
  const assignmentId = insertResult.rows[0].id;

  try {
    const plan = await generateStudyPlan({
      title,
      complexity,
      dueDate,
      description,
      totalItems,
    });

    if (plan.length > 0) {
      for (const task of plan) {
        // Keep insert simple/readable; volume here is small.
        // eslint-disable-next-line no-await-in-loop
        await db.query(
          'INSERT INTO study_tasks (assignment_id, task_description, scheduled_date, estimated_minutes) VALUES ($1, $2, $3, $4)',
          [assignmentId, task.task_description, task.scheduled_date, task.estimated_minutes],
        );
      }
    }

    return res.status(201).json({ message: 'Assignment created', id: assignmentId });
  } catch (_aiError) {
    return res.status(500).json({ error: 'Saved, but AI failed.' });
  }
}));

app.delete('/api/assignments/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.id;

  const found = await db.query(
    'SELECT id FROM assignments WHERE id = $1 AND user_id = $2',
    [assignmentId, userId],
  );
  if (found.rowCount === 0) return res.status(404).json({ error: 'Assignment not found.' });

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS count FROM study_tasks WHERE assignment_id = $1',
    [assignmentId],
  );
  const deletedTaskCount = countResult.rows[0]?.count || 0;

  const deleted = await db.query(
    'DELETE FROM assignments WHERE id = $1 AND user_id = $2 RETURNING id',
    [assignmentId, userId],
  );
  if (deleted.rowCount === 0) return res.status(404).json({ error: 'Assignment not found.' });

  return res.json({
    message: 'Assignment deleted.',
    assignmentId,
    deletedTaskCount,
  });
}));

app.get('/api/assignment/plan/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req, res) => {
  const sql = `
    SELECT study_tasks.* FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.assignment_id = $1 AND assignments.user_id = $2
    ORDER BY study_tasks.scheduled_date ASC
  `;

  const result = await db.query(sql, [req.params.id, req.user.id]);
  return res.json(result.rows);
}));

app.get('/api/timeline', authenticateToken, withErrorBoundary(async (req, res) => {
  const cleanupSql = `
    DELETE FROM study_tasks st
    USING assignments a
    WHERE st.assignment_id = a.id
      AND a.user_id = $1
      AND st.scheduled_date < CURRENT_DATE - INTERVAL '10 days'
  `;

  await db.query(cleanupSql, [req.user.id]);

  const sql = `
    SELECT
      study_tasks.*,
      assignments.title AS assignment_title,
      assignments.complexity
    FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE assignments.user_id = $1
    ORDER BY study_tasks.scheduled_date ASC
  `;

  const result = await db.query(sql, [req.user.id]);
  return res.json(result.rows);
}));

app.patch('/api/tasks/:id', authenticateToken, validateIdParam, validateTaskUpdate, withErrorBoundary(async (req, res) => {
  const {
    task_description,
    scheduled_date,
    estimated_minutes,
    completed,
  } = req.body;

  const sql = `
    SELECT
      study_tasks.*,
      assignments.title as assignment_title,
      assignments.complexity
    FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.id = $1
      AND assignments.user_id = $2
  `;

  const existingResult = await db.query(sql, [req.params.id, req.user.id]);
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: 'Task not found.' });

  const nextTaskDescription = task_description ?? existing.task_description;
  const nextScheduledDate = scheduled_date ?? existing.scheduled_date;
  const nextEstimatedMinutes = estimated_minutes ?? existing.estimated_minutes;
  const nextCompleted = completed === undefined ? existing.completed : completed;

  const updated = await db.query(
    `UPDATE study_tasks
    SET task_description = $1,
        scheduled_date = $2,
        estimated_minutes = $3,
        completed = $4
    WHERE id = $5
    RETURNING id`,
    [nextTaskDescription, nextScheduledDate, nextEstimatedMinutes, nextCompleted, req.params.id],
  );

  if (updated.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ message: 'Task updated.' });
}));

app.delete('/api/tasks/:id', authenticateToken, validateIdParam, withErrorBoundary(async (req, res) => {
  const sql = `
    DELETE FROM study_tasks
    WHERE id = $1
      AND assignment_id IN (
        SELECT id FROM assignments WHERE user_id = $2
      )
    RETURNING id
  `;

  const deleted = await db.query(sql, [req.params.id, req.user.id]);
  if (deleted.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ message: 'Task deleted.' });
}));

app.get('/api/history', authenticateToken, withErrorBoundary(async (req, res) => {
  const sql = `
    SELECT
      study_tasks.*,
      assignments.title AS assignment_title,
      assignments.complexity
    FROM study_tasks
    JOIN assignments ON study_tasks.assignment_id = assignments.id
    WHERE study_tasks.completed = true
      AND assignments.user_id = $1
    ORDER BY study_tasks.scheduled_date DESC
  `;

  const result = await db.query(sql, [req.user.id]);
  return res.json(result.rows);
}));

app.patch('/api/tasks/:id/toggle', authenticateToken, validateIdParam, validateTaskToggle, withErrorBoundary(async (req, res) => {
  const sql = `
    UPDATE study_tasks
    SET completed = $1
    WHERE id = $2
      AND assignment_id IN (
        SELECT id FROM assignments WHERE user_id = $3
      )
    RETURNING id
  `;

  const result = await db.query(sql, [req.body.completed, req.params.id, req.user.id]);
  if (result.rowCount === 0) {
    return res.status(403).json({ error: 'Access denied or task not found.' });
  }
  return res.json({ message: 'Task updated', changes: result.rowCount });
}));

module.exports = app;
