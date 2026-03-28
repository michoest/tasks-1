import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/tasks.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();
    cleanExpiredSessions();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      inbox_reminder_time TEXT DEFAULT '20:00',
      webhook_token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expire INTEGER NOT NULL,
      sess TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS space_members (
      space_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (space_id, user_id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#607D8B',
      icon TEXT,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      UNIQUE(space_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_lists_space ON lists(space_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      list_id INTEGER,
      title TEXT NOT NULL,
      notes TEXT,
      recurrence_type TEXT NOT NULL DEFAULT 'one_time',
      interval_days INTEGER,
      schedule_pattern TEXT,
      start_date TEXT,
      due_date TEXT,
      has_specific_time INTEGER DEFAULT 0,
      time_of_day TEXT,
      grace_period_minutes INTEGER DEFAULT 120,
      next_due_date TEXT,
      next_due_datetime TEXT,
      active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      waiting_for TEXT,
      waiting_until TEXT,
      last_completed_at TEXT,
      last_completed_by INTEGER,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (last_completed_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_space ON tasks(space_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_next_due ON tasks(next_due_date);

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      depends_on_id INTEGER NOT NULL,
      UNIQUE(task_id, depends_on_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      completed_by INTEGER NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      was_overdue INTEGER DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (completed_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_completions_task ON completions(task_id);
    CREATE INDEX IF NOT EXISTS idx_completions_user ON completions(completed_by);
    CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completed_at);
  `);
}

function runMigrations() {
  // Add color column to space_members for per-user space colors
  try { db.exec('ALTER TABLE space_members ADD COLUMN color TEXT DEFAULT NULL'); } catch { /* exists */ }
}

function cleanExpiredSessions() {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM sessions WHERE expire < ?').run(now);
}
