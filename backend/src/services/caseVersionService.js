import { db } from '../db/schema.js';
import { readScript, writeScript } from './caseWorkspace.js';

function getCaseRow(teamId, caseId) {
  return db.prepare(
    "SELECT * FROM cases WHERE id = ? AND team_id = ? AND status = 'active'",
  ).get(Number(caseId), Number(teamId));
}

export function ensureCaseVersionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      script TEXT NOT NULL,
      change_note TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      UNIQUE(case_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_case_versions_case ON case_versions(case_id, version DESC);
  `);
}

function parseMeta(raw) {
  if (!raw) return {};
  try {
    const p = JSON.parse(String(raw));
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function getCurrentVersion(caseId) {
  const row = db.prepare('SELECT current_version FROM cases WHERE id = ?').get(Number(caseId));
  return row?.current_version || 1;
}

export function listCaseVersions(teamId, caseId) {
  ensureCaseVersionsTable();
  const caseRow = getCaseRow(teamId, caseId);
  if (!caseRow) throw new Error('用例不存在');
  return db.prepare(`
    SELECT id, case_id, version, change_note, source, created_by, created_at,
      LENGTH(script) AS script_length
    FROM case_versions
    WHERE case_id = ?
    ORDER BY version DESC
  `).all(Number(caseId));
}

export function getCaseVersionScript(teamId, caseId, version) {
  const caseRow = getCaseRow(teamId, caseId);
  if (!caseRow) throw new Error('用例不存在');
  const row = db.prepare(
    'SELECT script FROM case_versions WHERE case_id = ? AND version = ?',
  ).get(Number(caseId), Number(version));
  if (!row) throw new Error('版本不存在');
  return row.script;
}

/** 脚本变更时写入新版本并 bump cases.current_version */
export function createOnScriptChange(teamId, caseId, script, {
  changeNote = null,
  source = 'user',
  createdBy = null,
} = {}) {
  ensureCaseVersionsTable();
  const caseRow = getCaseRow(teamId, caseId);
  if (!caseRow) throw new Error('用例不存在');

  const scriptText = String(script || '');
  if (!scriptText.trim()) throw new Error('script 不能为空');

  const last = db.prepare(
    'SELECT version, script FROM case_versions WHERE case_id = ? ORDER BY version DESC LIMIT 1',
  ).get(Number(caseId));

  if (last && last.script === scriptText) {
    return { version: last.version, skipped: true };
  }

  const nextVersion = last ? last.version + 1 : 1;
  db.prepare(`
    INSERT INTO case_versions (case_id, version, script, change_note, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(caseId),
    nextVersion,
    scriptText,
    changeNote,
    source,
    createdBy,
  );

  db.prepare(`
    UPDATE cases SET current_version = ?, updated_at = datetime('now', '+8 hours') WHERE id = ? AND team_id = ?
  `).run(nextVersion, Number(caseId), Number(teamId));

  writeScript(teamId, caseId, scriptText, caseRow.script_path || 'case.spec.ts');

  let meta = parseMeta(caseRow.metadata_json);
  meta.script = scriptText;
  db.prepare('UPDATE cases SET metadata_json = ? WHERE id = ?').run(JSON.stringify(meta), Number(caseId));

  return { version: nextVersion, skipped: false };
}

export function restoreCaseVersion(teamId, caseId, version, { createdBy = null } = {}) {
  const script = getCaseVersionScript(teamId, caseId, version);
  return createOnScriptChange(teamId, caseId, script, {
    changeNote: `回滚至 v${version}`,
    source: 'restore',
    createdBy,
  });
}

/** 为已有用例补齐 v1（迁移一次） */
export function seedCaseVersions() {
  ensureCaseVersionsTable();
  db.exec(`CREATE TABLE IF NOT EXISTS _uiauto_migrations (name TEXT PRIMARY KEY);`);
  if (db.prepare("SELECT 1 FROM _uiauto_migrations WHERE name = 'case_versions_v1'").get()) {
    return;
  }

  const cases = db.prepare("SELECT id, team_id, script_path, metadata_json, current_version FROM cases WHERE status = 'active'").all();
  let seeded = 0;
  for (const c of cases) {
    const has = db.prepare('SELECT 1 FROM case_versions WHERE case_id = ? LIMIT 1').get(c.id);
    if (has) continue;
    const meta = parseMeta(c.metadata_json);
    let script = meta.script || readScript(c.team_id, c.id, c.script_path || 'case.spec.ts');
    if (!script || !String(script).trim()) continue;
    const ver = c.current_version || 1;
    db.prepare(`
      INSERT INTO case_versions (case_id, version, script, change_note, source, created_by)
      VALUES (?, ?, ?, ?, 'migration', 'system')
    `).run(c.id, ver, String(script), '初始版本');
    db.prepare('UPDATE cases SET current_version = ? WHERE id = ?').run(ver, c.id);
    seeded += 1;
  }

  db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('case_versions_v1')").run();
  if (seeded > 0) console.log(`[Schema] case_versions_v1 seed: ${seeded} cases`);
}
