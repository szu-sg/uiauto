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

export default db;
