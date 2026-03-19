import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'uiauto.db');

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_branch TEXT DEFAULT 'main',
    cases_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    finished_at TEXT,
    result_dir TEXT,
    log_text TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS run_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    case_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    duration_ms INTEGER,
    error_message TEXT,
    screenshot_path TEXT,
    video_path TEXT,
    trace_path TEXT,
    log_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
  );
`);

// 确保定时执行相关列存在（兼容旧库）
const planCols = db.prepare("PRAGMA table_info(plans)").all().map((c) => c.name);
if (!planCols.includes('schedule_cron')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN schedule_cron TEXT DEFAULT NULL'); } catch (_) {}
}
if (!planCols.includes('schedule_enabled')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN schedule_enabled INTEGER DEFAULT 0'); } catch (_) {}
}
if (!planCols.includes('creator')) {
  try { db.exec("ALTER TABLE plans ADD COLUMN creator TEXT DEFAULT NULL"); } catch (_) {}
}
if (!planCols.includes('case_display_names_json')) {
  try { db.exec("ALTER TABLE plans ADD COLUMN case_display_names_json TEXT DEFAULT NULL"); } catch (_) {}
}
if (!planCols.includes('case_metadata_json')) {
  try { db.exec("ALTER TABLE plans ADD COLUMN case_metadata_json TEXT DEFAULT NULL"); } catch (_) {}
}
if (!planCols.includes('run_browsers_json')) {
  try { db.exec("ALTER TABLE plans ADD COLUMN run_browsers_json TEXT DEFAULT NULL"); } catch (_) {}
}
if (!planCols.includes('user_id')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch (_) {}
}

const runCols = db.prepare("PRAGMA table_info(runs)").all().map((c) => c.name);
if (!runCols.includes('progress_phase')) {
  try { db.exec("ALTER TABLE runs ADD COLUMN progress_phase TEXT DEFAULT NULL"); } catch (_) {}
}

const runCaseCols = db.prepare("PRAGMA table_info(run_cases)").all().map((c) => c.name);
if (!runCaseCols.includes('browser')) {
  try { db.exec("ALTER TABLE run_cases ADD COLUMN browser TEXT DEFAULT NULL"); } catch (_) {}
}
if (!runCaseCols.includes('screenshots_json')) {
  try { db.exec("ALTER TABLE run_cases ADD COLUMN screenshots_json TEXT DEFAULT NULL"); } catch (_) {}
}

// 一次性迁移：将已有的 created_at / started_at / finished_at 从 UTC 转为北京时间
db.exec(`CREATE TABLE IF NOT EXISTS _uiauto_migrations (name TEXT PRIMARY KEY);`);
const migrated = db.prepare("SELECT 1 FROM _uiauto_migrations WHERE name = 'beijing_time'").get();
if (!migrated) {
  try {
    const pad = (n) => String(n).padStart(2, '0');
    const toBeijing = (s) => {
      if (!s || typeof s !== 'string') return s;
      const d = new Date(s.includes('Z') || s.includes('+') || /-\d{2}:\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
      if (Number.isNaN(d.getTime())) return s;
      const b = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}:${pad(b.getUTCSeconds())}`;
    };
    const runRows = db.prepare('SELECT id, created_at, started_at, finished_at FROM runs').all();
    const runUpdate = db.prepare('UPDATE runs SET created_at = ?, started_at = ?, finished_at = ? WHERE id = ?');
    for (const row of runRows) {
      runUpdate.run(
        toBeijing(row.created_at) ?? row.created_at,
        toBeijing(row.started_at) ?? row.started_at,
        toBeijing(row.finished_at) ?? row.finished_at,
        row.id
      );
    }
    const planRows = db.prepare('SELECT id, created_at FROM plans').all();
    const planUpdate = db.prepare('UPDATE plans SET created_at = ? WHERE id = ?');
    for (const row of planRows) {
      planUpdate.run(toBeijing(row.created_at) ?? row.created_at, row.id);
    }
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('beijing_time')").run();
  } catch (_) {}
}

export default db;
