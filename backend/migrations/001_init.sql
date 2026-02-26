CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  complexity TEXT,
  due_date DATE NOT NULL,
  total_items INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_tasks (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  estimated_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  start_page TEXT NOT NULL DEFAULT 'dashboard',
  assignment_default_complexity TEXT NOT NULL DEFAULT 'Medium',
  assignment_default_items INTEGER NOT NULL DEFAULT 5,
  confirm_assignment_delete BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_created ON assignments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_tasks_assignment_date ON study_tasks (assignment_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_study_tasks_completed ON study_tasks (completed);
