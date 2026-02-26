const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'study_planner.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error opening database:', err.message);
  else console.log('Connected to SQLite database.');
});

db.serialize(() => {
  // 1. Users Table (NEW)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT
  )`);

  // 2. Assignments Table (Updated to include user_id)
  db.run(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, 
    title TEXT NOT NULL,
    complexity TEXT, 
    due_date TEXT NOT NULL,
    total_items INTEGER, 
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // 3. Study Tasks Table
  db.run(`CREATE TABLE IF NOT EXISTS study_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    task_description TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    estimated_minutes INTEGER,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
  )`);

  // 4. User Settings Table
  db.run(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    theme_mode TEXT NOT NULL DEFAULT 'light',
    start_page TEXT NOT NULL DEFAULT 'dashboard',
    assignment_default_complexity TEXT NOT NULL DEFAULT 'Medium',
    assignment_default_items INTEGER NOT NULL DEFAULT 5,
    confirm_assignment_delete INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // One-time compatibility update: convert untouched legacy defaults from system -> light.
  db.run(`UPDATE user_settings
    SET theme_mode = 'light',
        updated_at = CURRENT_TIMESTAMP
    WHERE theme_mode = 'system'
      AND updated_at = created_at`);
});

module.exports = db;
