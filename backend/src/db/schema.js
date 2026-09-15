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
    real_name TEXT DEFAULT NULL,
    uid TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'member',
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
if (!planCols.includes('schedule_once')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN schedule_once INTEGER DEFAULT 0'); } catch (_) {}
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
if (!planCols.includes('notify_webhook_url')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN notify_webhook_url TEXT DEFAULT NULL'); } catch (_) {}
}
if (!planCols.includes('notify_mention_userids_json')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN notify_mention_userids_json TEXT DEFAULT NULL'); } catch (_) {}
}
if (!planCols.includes('notify_on_created')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN notify_on_created INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
}
if (!planCols.includes('notify_on_success')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN notify_on_success INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
}
if (!planCols.includes('notify_on_failure')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN notify_on_failure INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
}

const runCols = db.prepare("PRAGMA table_info(runs)").all().map((c) => c.name);
if (!runCols.includes('progress_phase')) {
  try { db.exec("ALTER TABLE runs ADD COLUMN progress_phase TEXT DEFAULT NULL"); } catch (_) {}
}
if (!runCols.includes('triggered_by_user_id')) {
  try { db.exec('ALTER TABLE runs ADD COLUMN triggered_by_user_id INTEGER REFERENCES users(id)'); } catch (_) {}
}

const runCaseCols = db.prepare("PRAGMA table_info(run_cases)").all().map((c) => c.name);
if (!runCaseCols.includes('browser')) {
  try { db.exec("ALTER TABLE run_cases ADD COLUMN browser TEXT DEFAULT NULL"); } catch (_) {}
}
if (!runCaseCols.includes('screenshots_json')) {
  try { db.exec("ALTER TABLE run_cases ADD COLUMN screenshots_json TEXT DEFAULT NULL"); } catch (_) {}
}

const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes('real_name')) {
  try { db.exec("ALTER TABLE users ADD COLUMN real_name TEXT DEFAULT NULL"); } catch (_) {}
}
if (!userCols.includes('uid')) {
  try { db.exec("ALTER TABLE users ADD COLUMN uid TEXT DEFAULT NULL"); } catch (_) {}
}
if (!userCols.includes('role')) {
  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'"); } catch (_) {}
}
if (!userCols.includes('oauth_uid')) {
  try { db.exec('ALTER TABLE users ADD COLUMN oauth_uid TEXT DEFAULT NULL'); } catch (_) {}
}
if (!userCols.includes('wps_uid')) {
  try { db.exec('ALTER TABLE users ADD COLUMN wps_uid INTEGER DEFAULT NULL'); } catch (_) {}
}
if (!userCols.includes('avatar')) {
  try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL'); } catch (_) {}
}
if (!userCols.includes('email')) {
  try { db.exec('ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL'); } catch (_) {}
}
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid) WHERE uid IS NOT NULL');
} catch (_) {}
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_uid ON users(oauth_uid) WHERE oauth_uid IS NOT NULL');
} catch (_) {}
try {
  db.exec("UPDATE users SET role = 'member' WHERE role = 'user' OR role IS NULL OR trim(role) = ''");
} catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS execution_environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    env_kind TEXT NOT NULL DEFAULT 'test',
    base_url TEXT DEFAULT NULL,
    headers_json TEXT DEFAULT NULL,
    test_username TEXT DEFAULT NULL,
    test_password TEXT DEFAULT NULL,
    extra_env_json TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
  );
`);
const envTableCols = db.prepare('PRAGMA table_info(execution_environments)').all().map((c) => c.name);
if (!envTableCols.includes('switchhosts_text')) {
  try {
    db.exec('ALTER TABLE execution_environments ADD COLUMN switchhosts_text TEXT DEFAULT NULL');
  } catch (_) {}
}
if (!envTableCols.includes('wps_company_name')) {
  try {
    db.exec('ALTER TABLE execution_environments ADD COLUMN wps_company_name TEXT DEFAULT NULL');
  } catch (_) {}
}
if (!planCols.includes('environment_id')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN environment_id INTEGER REFERENCES execution_environments(id)'); } catch (_) {}
}
if (!planCols.includes('plan_type')) {
  try { db.exec("ALTER TABLE plans ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'ui_auto'"); } catch (_) {}
}
if (!planCols.includes('enabled')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
}
if (!runCols.includes('environment_id')) {
  try { db.exec('ALTER TABLE runs ADD COLUMN environment_id INTEGER REFERENCES execution_environments(id)'); } catch (_) {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS case_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_branch TEXT NOT NULL DEFAULT 'main',
    path TEXT NOT NULL,
    name TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    priority TEXT DEFAULT NULL,
    metadata_json TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    UNIQUE(user_id, repo_owner, repo_name, repo_branch, path)
  );
`);

const catalogCols = db.prepare('PRAGMA table_info(case_catalog)').all().map((c) => c.name);
if (!catalogCols.includes('default_environment_id')) {
  try { db.exec('ALTER TABLE case_catalog ADD COLUMN default_environment_id INTEGER REFERENCES execution_environments(id)'); } catch (_) {}
}
if (!catalogCols.includes('environment_snapshot_json')) {
  try { db.exec('ALTER TABLE case_catalog ADD COLUMN environment_snapshot_json TEXT DEFAULT NULL'); } catch (_) {}
}
if (!catalogCols.includes('portability')) {
  try { db.exec("ALTER TABLE case_catalog ADD COLUMN portability TEXT NOT NULL DEFAULT 'bundle'"); } catch (_) {}
}
if (!catalogCols.includes('case_source')) {
  try { db.exec("ALTER TABLE case_catalog ADD COLUMN case_source TEXT DEFAULT 'recorded'"); } catch (_) {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member'
      CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by INTEGER REFERENCES users(id),
    joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS team_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    real_name TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'member'
      CHECK (role IN ('admin', 'member', 'viewer')),
    invited_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    UNIQUE (team_id, email)
  );
`);

const teamCols = db.prepare('PRAGMA table_info(teams)').all().map((c) => c.name);
if (!teamCols.includes('status')) {
  try { db.exec("ALTER TABLE teams ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); } catch (_) {}
}

if (!catalogCols.includes('team_id')) {
  try { db.exec('ALTER TABLE case_catalog ADD COLUMN team_id INTEGER REFERENCES teams(id)'); } catch (_) {}
}
if (!envTableCols.includes('team_id')) {
  try { db.exec('ALTER TABLE execution_environments ADD COLUMN team_id INTEGER REFERENCES teams(id)'); } catch (_) {}
}
if (!planCols.includes('case_ids_json')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN case_ids_json TEXT DEFAULT NULL'); } catch (_) {}
}
if (!planCols.includes('team_id')) {
  try { db.exec('ALTER TABLE plans ADD COLUMN team_id INTEGER REFERENCES teams(id)'); } catch (_) {}
}
if (!runCols.includes('team_id')) {
  try { db.exec('ALTER TABLE runs ADD COLUMN team_id INTEGER REFERENCES teams(id)'); } catch (_) {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS recorded_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    case_catalog_id INTEGER DEFAULT NULL,
    case_path TEXT NOT NULL,
    case_name TEXT DEFAULT NULL,
    environment_id INTEGER DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    exit_code INTEGER DEFAULT NULL,
    started_at TEXT DEFAULT NULL,
    finished_at TEXT DEFAULT NULL,
    log_text TEXT DEFAULT NULL,
    result_dir TEXT DEFAULT NULL,
    screenshot_path TEXT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
  );
`);

const recordedRunCols = db.prepare('PRAGMA table_info(recorded_runs)').all().map((c) => c.name);
if (!recordedRunCols.includes('team_id')) {
  try { db.exec('ALTER TABLE recorded_runs ADD COLUMN team_id INTEGER REFERENCES teams(id)'); } catch (_) {}
}
if (!recordedRunCols.includes('video_path')) {
  try { db.exec('ALTER TABLE recorded_runs ADD COLUMN video_path TEXT DEFAULT NULL'); } catch (_) {}
}

// 团队库：为已有用户创建默认团队并回填 team_id
db.exec(`CREATE TABLE IF NOT EXISTS _uiauto_migrations (name TEXT PRIMARY KEY);`);
const teamMigrated = db.prepare("SELECT 1 FROM _uiauto_migrations WHERE name = 'teams_v1'").get();
if (!teamMigrated) {
  try {
    const users = db.prepare('SELECT id, real_name, username FROM users').all();
    for (const u of users) {
      const existing = db.prepare(
        'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1',
      ).get(u.id);
      let teamId = existing?.team_id;
      if (!teamId) {
        const label = (u.real_name && String(u.real_name).trim())
          || (u.username && String(u.username).split('@')[0])
          || '个人空间';
        const slug = `personal-${u.id}`;
        const ins = db.prepare(
          'INSERT INTO teams (name, slug, created_by) VALUES (?, ?, ?)',
        ).run(`${label}的空间`, slug, u.id);
        teamId = ins.lastInsertRowid;
        db.prepare(
          'INSERT OR IGNORE INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
        ).run(teamId, u.id, 'owner', u.id);
      }
      db.prepare('UPDATE case_catalog SET team_id = ? WHERE user_id = ? AND team_id IS NULL').run(teamId, u.id);
      db.prepare('UPDATE plans SET team_id = ? WHERE user_id = ? AND team_id IS NULL').run(teamId, u.id);
      db.prepare('UPDATE execution_environments SET team_id = ? WHERE user_id = ? AND team_id IS NULL').run(teamId, u.id);
      db.prepare('UPDATE recorded_runs SET team_id = ? WHERE user_id = ? AND team_id IS NULL').run(teamId, u.id);
    }
    db.prepare('UPDATE runs SET team_id = (SELECT p.team_id FROM plans p WHERE p.id = runs.plan_id) WHERE team_id IS NULL').run();
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('teams_v1')").run();
  } catch (e) {
    console.warn('[Schema] teams_v1 migration:', e.message);
  }
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

// 历史个人空间 slug personal-{userId} → space-{teamId}
const personalSlugMigrated = db.prepare(
  "SELECT 1 FROM _uiauto_migrations WHERE name = 'rename_personal_slugs'",
).get();
if (!personalSlugMigrated) {
  try {
    const rows = db.prepare("SELECT id, slug FROM teams WHERE slug LIKE 'personal-%'").all();
    for (const row of rows) {
      const next = `space-${row.id}`;
      const clash = db.prepare('SELECT 1 FROM teams WHERE slug = ? AND id != ?').get(next, row.id);
      const slug = clash ? `space-${row.id}-${row.id}` : next;
      db.prepare('UPDATE teams SET slug = ? WHERE id = ?').run(slug, row.id);
    }
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('rename_personal_slugs')").run();
  } catch (e) {
    console.warn('[Schema] rename_personal_slugs:', e.message);
  }
}

export default db;
