import fs from 'fs';
import path from 'path';
import { db } from '../db/schema.js';
import {
  DEFAULT_SCRIPT,
  ensureWorkspaceShell,
  importLegacyFile,
  loadAuth,
  playwrightCasePath,
  readScript,
  removeCaseWorkspace,
  resolveStorageState,
  clearAuth,
  writeAuth,
  writeEnvSnapshot,
  writeScript,
} from './caseWorkspace.js';
import { caseHasOwnEnvironment } from './resolveEnvironment.js';
import { RECORDED_CASES_ROOT } from './recordedCases.js';
import { createOnScriptChange, seedCaseVersions } from './caseVersionService.js';
import { resolveTeamIdForUser } from './teamService.js';
import { ensureCaseFoldersSchema } from './caseFolderService.js';

const LEGACY_CATALOG_OWNER = 'uiauto';
const LEGACY_CATALOG_REPO = 'recorded';

function normalizePriority(p) {
  if (p == null || String(p).trim() === '') return null;
  const v = String(p).trim().toUpperCase();
  if (['P0', 'P1', 'P2'].includes(v)) return v;
  if (['P3', 'P4'].includes(v)) return 'P2';
  return null;
}

function resolveCatalogCreatedBy(userId) {
  const uid = Number(userId);
  if (uid && db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return uid;
  const fallback = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  return fallback?.id || uid;
}

function resolveCatalogTeamId(cc) {
  if (cc.team_id) {
    const ok = db.prepare('SELECT 1 FROM teams WHERE id = ?').get(Number(cc.team_id));
    if (ok) return Number(cc.team_id);
  }
  const tid = resolveTeamIdForUser(cc.user_id);
  if (tid) return tid;
  if (cc.team_id) return Number(cc.team_id);
  return Number(cc.user_id) || null;
}

function parseJson(raw, fallback = null) {
  if (raw == null || String(raw).trim() === '') return fallback;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function rowFromDb(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json, {});
  const tags = parseJson(row.tags_json, []);
  return {
    ...row,
    metadata,
    tags,
  };
}

/** API 层：团队用例库条目 */
export function caseToApi(row, userJoin = {}) {
  const r = rowFromDb(row);
  if (!r) return null;
  const displayPath = `${r.team_id}/${r.id}/${r.script_path || DEFAULT_SCRIPT}`;
  const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  return {
    id: r.id,
    team_id: r.team_id,
    path: displayPath,
    legacy_path: r.legacy_path || null,
    script_path: r.script_path || DEFAULT_SCRIPT,
    name: r.name || null,
    description: r.description || null,
    priority: r.priority || null,
    metadata: meta,
    tags: Array.isArray(r.tags) ? r.tags : [],
    default_environment_id: r.default_environment_id ?? null,
    environment_snapshot_json: r.environment_snapshot_json ?? null,
    portability: r.portability || 'portable',
    case_source: r.source || r.case_source || 'recorded',
    source: r.source || r.case_source || 'recorded',
    status: r.status || 'active',
    has_own_environment: caseHasOwnEnvironment({
      default_environment_id: r.default_environment_id,
      environment_snapshot_json: r.environment_snapshot_json,
      portability: r.portability,
    }),
    created_at: r.created_at,
    updated_at: r.updated_at,
    current_version: r.current_version || 1,
    folder_id: r.folder_id ?? null,
    created_by: (r.created_by || r.user_id) ? {
      id: r.created_by || r.user_id,
      real_name: userJoin.real_name || null,
      username: userJoin.username || null,
      email: userJoin.email || null,
      uid: userJoin.uid || null,
      avatar: userJoin.avatar || null,
    } : null,
  };
}

export function listCases(teamId, { q, source, portability, folder_id } = {}) {
  migrateCatalogToCases();
  ensureCaseFoldersSchema();
  seedCaseVersions();
  const tid = Number(teamId);
  let sql = `
    SELECT c.*, u.real_name, u.username, u.uid, u.email, u.avatar
    FROM cases c
    LEFT JOIN users u ON u.id = c.created_by
    WHERE c.team_id = ? AND c.status = 'active'
  `;
  const params = [tid];
  if (source) {
    sql += ' AND c.source = ?';
    params.push(String(source));
  }
  if (portability) {
    sql += ' AND c.portability = ?';
    params.push(String(portability));
  }
  if (folder_id === 'uncategorized' || folder_id === 'null') {
    sql += ' AND c.folder_id IS NULL';
  } else if (folder_id != null && folder_id !== '' && folder_id !== 'all') {
    sql += ' AND c.folder_id = ?';
    params.push(Number(folder_id));
  }
  sql += ' ORDER BY c.created_at DESC, c.id DESC';
  const rows = db.prepare(sql).all(...params);
  let items = rows.map((row) => caseToApi(row, row));
  const keyword = String(q || '').trim().toLowerCase();
  if (keyword) {
    items = items.filter((item) => {
      const hay = [
        item.path,
        item.name,
        item.description,
        item.case_source,
        item.metadata?.module,
        ...(Array.isArray(item.tags) ? item.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(keyword);
    });
  }
  return items;
}

export function getCase(teamId, caseId) {
  migrateCatalogToCases();
  const row = db.prepare(`
    SELECT c.*, u.real_name, u.username, u.uid, u.email, u.avatar
    FROM cases c
    LEFT JOIN users u ON u.id = c.created_by
    WHERE c.id = ? AND c.team_id = ? AND c.status = 'active'
  `).get(Number(caseId), Number(teamId));
  if (!row) return null;
  const item = caseToApi(row, row);
  const meta = item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {};
  if (!String(meta.script || '').trim()) {
    const fromFile = readScript(Number(teamId), Number(caseId), item.script_path || DEFAULT_SCRIPT);
    if (fromFile) meta.script = fromFile;
  }
  item.metadata = meta;
  item.script = meta.script || '';
  return item;
}

export function getCaseRecord(teamId, caseId) {
  const row = db.prepare(
    'SELECT * FROM cases WHERE id = ? AND team_id = ? AND status = ?',
  ).get(Number(caseId), Number(teamId), 'active');
  return row ? rowFromDb(row) : null;
}

export function getCasePathForPlan(teamId, caseId) {
  const row = getCaseRecord(teamId, caseId);
  if (!row) throw new Error(`用例 #${caseId} 不存在或不属于当前团队`);
  return playwrightCasePath(row.team_id, row.id, row.script_path || DEFAULT_SCRIPT);
}

export function resolveCaseIdsToPaths(teamId, caseIds) {
  const paths = [];
  for (const rawId of caseIds) {
    const cid = Number(rawId);
    if (!cid) continue;
    paths.push(getCasePathForPlan(teamId, cid));
  }
  return paths;
}

function resolveCaseRowByPath(teamId, casePath) {
  const p = String(casePath || '').trim().replace(/^\/+/, '');
  const parts = p.split('/');
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const row = db.prepare(
      "SELECT * FROM cases WHERE id = ? AND team_id = ? AND status = 'active'",
    ).get(Number(parts[1]), Number(parts[0]));
    if (row) return { row, pathKey: p };
  }
  const row = db.prepare(
    "SELECT * FROM cases WHERE team_id = ? AND legacy_path = ? AND status = 'active'",
  ).get(Number(teamId), p);
  return row ? { row, pathKey: p } : null;
}

function caseRowToPlanMeta(row, userJoin = {}) {
  const meta = parseJson(row.metadata_json, {});
  return {
    name: row.name,
    description: row.description,
    priority: row.priority,
    created_at: row.created_at,
    creator: userJoin.real_name || userJoin.username || userJoin.email || null,
    source: row.source,
    ...meta,
  };
}

/** 计划详情：从 cases 表构建显示名与元数据 */
export function buildCaseDisplayDataForPlan(teamId, caseIds = [], casePaths = []) {
  const names = {};
  const metadata = {};
  const seenPaths = new Set();

  for (const rawId of caseIds) {
    const cid = Number(rawId);
    if (!cid) continue;
    const row = db.prepare(`
      SELECT c.*, u.real_name, u.username, u.email
      FROM cases c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ? AND c.team_id = ? AND c.status = 'active'
    `).get(cid, Number(teamId));
    if (!row) continue;
    const p = playwrightCasePath(row.team_id, row.id, row.script_path || DEFAULT_SCRIPT);
    seenPaths.add(p);
    names[p] = row.name || p;
    metadata[p] = caseRowToPlanMeta(row, row);
  }

  for (const casePath of casePaths) {
    const p = String(casePath || '').trim();
    if (!p || seenPaths.has(p)) continue;
    const resolved = resolveCaseRowByPath(teamId, p);
    if (resolved) {
      const { row, pathKey } = resolved;
      const userJoin = db.prepare(
        'SELECT real_name, username, email FROM users WHERE id = ?',
      ).get(row.created_by);
      names[pathKey] = row.name || pathKey;
      metadata[pathKey] = caseRowToPlanMeta(row, userJoin || {});
      seenPaths.add(pathKey);
    } else {
      names[p] = p.split('/').pop() || p;
    }
  }

  return { names, metadata };
}

function parseCaseIdsFromPlan(plan) {
  try {
    const ids = JSON.parse(String(plan?.case_ids_json || '[]'));
    return Array.isArray(ids) ? ids.map(Number).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

/** 计划详情：按 case_ids 组装用例条目（录制/导入统一结构） */
export function buildPlanCaseItems(teamId, plan) {
  const caseIds = parseCaseIdsFromPlan(plan);
  const items = [];
  for (const cid of caseIds) {
    const row = db.prepare(`
      SELECT c.*, u.real_name, u.username, u.email
      FROM cases c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ? AND c.team_id = ? AND c.status = 'active'
    `).get(cid, Number(teamId));
    if (!row) continue;
    const path = playwrightCasePath(row.team_id, row.id, row.script_path || DEFAULT_SCRIPT);
    const meta = parseJson(row.metadata_json, {});
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const needsPlanEnv = row.portability !== 'bundle' || !caseHasOwnEnvironment(row);
    items.push({
      id: row.id,
      name: row.name || `用例 #${row.id}`,
      path,
      legacy_path: row.legacy_path,
      source: row.source,
      priority: row.priority,
      portability: row.portability || 'portable',
      has_own_environment: caseHasOwnEnvironment(row),
      needs_plan_environment: needsPlanEnv,
      tags,
      description: row.description,
      folder_id: row.folder_id,
      created_at: row.created_at,
      created_by: row.created_by ? {
        id: row.created_by,
        real_name: row.real_name || null,
        username: row.username || null,
        email: row.email || null,
      } : null,
    });
  }
  return items;
}

export function createCase(teamId, userId, payload) {
  const name = String(payload.name || '').trim();
  const script = String(payload.script || '').trim();
  if (!name) throw new Error('name 必填');
  if (!script) throw new Error('script 必填');

  const source = String(payload.source || 'recorded').trim() || 'recorded';
  const portability = payload.portability === 'bundle' ? 'bundle' : 'portable';
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const meta = payload.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {};
  meta.script = script;

  ensureCaseFoldersSchema();
  let folderId = null;
  if (payload.folder_id != null && payload.folder_id !== '') {
    folderId = Number(payload.folder_id);
    const folderOk = db.prepare(
      'SELECT 1 FROM case_folders WHERE id = ? AND team_id = ?',
    ).get(folderId, Number(teamId));
    if (!folderOk) throw new Error('文件夹不存在');
  }

  const r = db.prepare(`
    INSERT INTO cases (
      team_id, created_by, name, description, tags_json, priority, source, script_path,
      default_environment_id, environment_snapshot_json, metadata_json, portability, legacy_path, folder_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(teamId),
    Number(userId),
    name,
    payload.description != null ? String(payload.description).trim() || null : null,
    JSON.stringify(tags),
    payload.priority != null ? String(payload.priority).trim() || null : null,
    source,
    DEFAULT_SCRIPT,
    payload.default_environment_id ?? null,
    payload.environment_snapshot_json ?? null,
    JSON.stringify(meta),
    portability,
    payload.legacy_path ?? null,
    folderId,
  );
  const caseId = Number(r.lastInsertRowid);
  if (payload.storageState) writeAuth(teamId, caseId, payload.storageState);
  if (payload.environment_snapshot && typeof payload.environment_snapshot === 'object') {
    writeEnvSnapshot(teamId, caseId, payload.environment_snapshot);
  }

  createOnScriptChange(teamId, caseId, script, {
    changeNote: '创建用例',
    source: source,
    createdBy: String(userId),
  });
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  return caseToApi(row);
}

export function updateCase(teamId, caseId, patch, { userId = null } = {}) {
  const row = getCaseRecord(teamId, caseId);
  if (!row) throw new Error('用例不存在');

  let meta = { ...(row.metadata || {}) };
  const oldScript = meta.script || readScript(teamId, caseId, row.script_path || DEFAULT_SCRIPT) || '';
  if (patch.metadata && typeof patch.metadata === 'object') {
    meta = { ...meta, ...patch.metadata };
  }
  const inlineState = patch.storageState || patch.metadata?.storageState;
  if (inlineState) delete meta.storageState;

  const finalName = patch.name != null ? String(patch.name).trim() || null : row.name;
  const finalDesc = patch.description != null ? String(patch.description).trim() || null : row.description;
  const finalPriority = patch.priority != null ? String(patch.priority).trim() || null : row.priority;

  let finalTags = Array.isArray(row.tags) ? row.tags : [];
  if (patch.tags !== undefined) {
    finalTags = Array.isArray(patch.tags)
      ? patch.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
  } else if (patch.metadata?.tags !== undefined) {
    finalTags = Array.isArray(patch.metadata.tags)
      ? patch.metadata.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
  }
  meta.tags = finalTags;

  const legacyPath = patch.legacy_path ?? patch.path;
  if (legacyPath != null) {
    db.prepare('UPDATE cases SET legacy_path = ? WHERE id = ? AND team_id = ?').run(
      String(legacyPath).trim() || null,
      caseId,
      teamId,
    );
  }

  if (patch.folder_id !== undefined) {
    ensureCaseFoldersSchema();
    let fid = null;
    if (patch.folder_id != null && patch.folder_id !== '' && patch.folder_id !== 'null') {
      fid = Number(patch.folder_id);
      const folderOk = db.prepare(
        'SELECT 1 FROM case_folders WHERE id = ? AND team_id = ?',
      ).get(fid, teamId);
      if (!folderOk) throw new Error('文件夹不存在');
    }
    db.prepare('UPDATE cases SET folder_id = ? WHERE id = ? AND team_id = ?').run(fid, caseId, teamId);
  }

  const newScript = patch.script != null ? String(patch.script) : (meta.script != null ? String(meta.script) : '');
  const scriptChanged = Boolean(newScript.trim() && newScript !== oldScript);
  if (newScript.trim()) meta.script = newScript;
  else if (meta.script) writeScript(teamId, caseId, meta.script, row.script_path || DEFAULT_SCRIPT);
  if (patch.clear_auth === true) {
    clearAuth(teamId, caseId);
    meta.hasAuth = false;
    meta.cookieCount = 0;
    delete meta.storageState;
  } else if (inlineState) {
    const written = writeAuth(teamId, caseId, inlineState);
    if (written) {
      meta.hasAuth = true;
      meta.cookieCount = inlineState.cookies?.length ?? 0;
    }
  }

  if (patch.login_preference !== undefined) {
    const p = String(patch.login_preference || 'auto').toLowerCase();
    meta.login_preference = ['auto', 'case_context', 'plan_env'].includes(p) ? p : 'auto';
  }

  db.prepare(`
    UPDATE cases SET
      name = ?, description = ?, priority = ?, tags_json = ?, metadata_json = ?,
      updated_at = datetime('now', '+8 hours')
    WHERE id = ? AND team_id = ?
  `).run(
    finalName,
    finalDesc,
    finalPriority,
    JSON.stringify(finalTags),
    JSON.stringify(meta),
    caseId,
    teamId,
  );

  if (scriptChanged) {
    createOnScriptChange(teamId, caseId, meta.script, {
      changeNote: patch.change_note || null,
      source: 'user',
      createdBy: userId != null ? String(userId) : null,
    });
  }

  return getCase(teamId, caseId);
}

/** 删除 catalog 行，避免 migrateCatalogToCases 再次 INSERT 已删用例 */
function purgeCatalogForDeletedCase(caseRow) {
  if (!caseRow) return;
  const legacy = caseRow.legacy_path ? String(caseRow.legacy_path).trim() : '';
  if (legacy) {
    db.prepare(`
      DELETE FROM case_catalog
      WHERE repo_owner = ? AND repo_name = ? AND path = ?
    `).run(LEGACY_CATALOG_OWNER, LEGACY_CATALOG_REPO, legacy);
  }
  const catalogRow = db.prepare(`
    SELECT id, path FROM case_catalog
    WHERE id = ? AND repo_owner = ? AND repo_name = ?
  `).get(Number(caseRow.id), LEGACY_CATALOG_OWNER, LEGACY_CATALOG_REPO);
  if (catalogRow && (!legacy || String(catalogRow.path) === legacy)) {
    db.prepare('DELETE FROM case_catalog WHERE id = ?').run(catalogRow.id);
  }
}

/** 从本团队所有计划的 case_ids_json 中移除已删用例 */
function detachCaseFromPlans(teamId, caseId) {
  const tid = Number(teamId);
  const cid = Number(caseId);
  const plans = db.prepare('SELECT id, case_ids_json FROM plans WHERE team_id = ?').all(tid);
  for (const plan of plans) {
    let ids = [];
    try {
      ids = JSON.parse(plan.case_ids_json || '[]');
      if (!Array.isArray(ids)) ids = [];
    } catch (_) {
      ids = [];
    }
    const next = ids.map(Number).filter((n) => n > 0 && n !== cid);
    if (next.length !== ids.length) {
      db.prepare('UPDATE plans SET case_ids_json = ? WHERE id = ? AND team_id = ?').run(
        JSON.stringify(next),
        plan.id,
        tid,
      );
    }
  }
}

export function deleteCase(teamId, caseId) {
  const row = getCaseRecord(teamId, caseId);
  if (!row) throw new Error('用例不存在');
  purgeCatalogForDeletedCase(row);
  detachCaseFromPlans(teamId, caseId);
  removeCaseWorkspace(teamId, caseId);
  db.prepare('DELETE FROM case_versions WHERE case_id = ?').run(caseId);
  db.prepare('DELETE FROM cases WHERE id = ? AND team_id = ?').run(caseId, teamId);
  return { ok: true };
}

/** 执行前：确保 workspace 脚本与 auth 就绪 */
export function materializeCaseForRun(teamId, caseId) {
  const row = getCaseRecord(teamId, caseId);
  if (!row) throw new Error(`用例 #${caseId} 不存在`);

  ensureWorkspaceShell();
  const scriptPath = row.script_path || DEFAULT_SCRIPT;
  let script = readScript(teamId, caseId, scriptPath);
  if (!script) {
    const meta = parseJson(row.metadata_json, {});
    if (meta.script) {
      writeScript(teamId, caseId, meta.script, scriptPath);
      script = meta.script;
    }
  }
  if (!script && row.legacy_path) {
    const ok = importLegacyFile(teamId, caseId, row.legacy_path, scriptPath);
    if (!ok) {
      const legacyAbs = path.join(RECORDED_CASES_ROOT, row.legacy_path);
      if (fs.existsSync(legacyAbs)) {
        writeScript(teamId, caseId, fs.readFileSync(legacyAbs, 'utf8'), scriptPath);
      }
    }
    const meta = parseJson(row.metadata_json, {});
    if (meta.script) writeScript(teamId, caseId, meta.script, scriptPath);
  }
  if (!readScript(teamId, caseId, scriptPath)) {
    throw new Error(`用例「${row.name || caseId}」脚本不存在，请打开编辑后保存`);
  }

  const meta = parseJson(row.metadata_json, {});
  const loginPreference = meta.login_preference || 'auto';
  const storageState = resolveStorageState(teamId, caseId, null, {
    forRun: true,
    loginPreference,
  });
  const relPath = playwrightCasePath(teamId, caseId, scriptPath);
  return { row, relPath, storageState };
}

/** 启动迁移：catalog → cases + workspace（可重复补齐缺失行） */
export function migrateCatalogToCases() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      priority TEXT CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
      source TEXT NOT NULL DEFAULT 'recorded'
        CHECK (source IN ('recorded', 'imported', 'manual', 'mcp')),
      script_path TEXT NOT NULL DEFAULT 'case.spec.ts',
      legacy_path TEXT,
      default_environment_id INTEGER REFERENCES execution_environments(id),
      environment_snapshot_json TEXT,
      has_auth INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT,
      current_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
      portability TEXT NOT NULL DEFAULT 'portable'
        CHECK (portability IN ('bundle', 'portable')),
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_cases_team ON cases(team_id);
    CREATE INDEX IF NOT EXISTS idx_cases_team_source ON cases(team_id, source);
    CREATE INDEX IF NOT EXISTS idx_cases_team_status ON cases(team_id, status);
  `);

  const casesCols = db.prepare('PRAGMA table_info(cases)').all().map((c) => c.name);
  if (!casesCols.includes('current_version')) {
    try {
      db.exec('ALTER TABLE cases ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1');
    } catch (_) {}
  }

  ensureWorkspaceShell();
  const singleTeam = db.prepare('SELECT id FROM teams ORDER BY id ASC LIMIT 1').get();
  const teamCount = db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
  if (teamCount === 1 && singleTeam?.id) {
    db.prepare(`
      UPDATE case_catalog SET team_id = ?
      WHERE repo_owner = ? AND repo_name = ?
    `).run(singleTeam.id, LEGACY_CATALOG_OWNER, LEGACY_CATALOG_REPO);
    db.prepare(`
      UPDATE cases SET team_id = ?
      WHERE id IN (
        SELECT id FROM case_catalog WHERE repo_owner = ? AND repo_name = ?
      )
    `).run(singleTeam.id, LEGACY_CATALOG_OWNER, LEGACY_CATALOG_REPO);
  }

  const catalogRows = db.prepare(`
    SELECT * FROM case_catalog
    WHERE repo_owner = ? AND repo_name = ?
    ORDER BY id ASC
  `).all(LEGACY_CATALOG_OWNER, LEGACY_CATALOG_REPO);

  let migrated = 0;
  let skipped = 0;
  for (const cc of catalogRows) {
    const tid = resolveCatalogTeamId(cc);
    if (!tid) {
      skipped += 1;
      continue;
    }
    if (Number(cc.team_id) !== Number(tid)) {
      try {
        db.prepare('UPDATE case_catalog SET team_id = ? WHERE id = ?').run(tid, cc.id);
      } catch (_) {}
      cc.team_id = tid;
    }

    const exists = db.prepare('SELECT id, team_id FROM cases WHERE id = ?').get(cc.id);
    if (exists) {
      if (Number(exists.team_id) !== Number(tid)) {
        db.prepare('UPDATE cases SET team_id = ? WHERE id = ?').run(tid, cc.id);
      }
      continue;
    }

    const meta = parseJson(cc.metadata_json, {});
    const source = cc.case_source || (cc.path?.startsWith('imported/') ? 'imported' : 'recorded');
    const hasAuth = meta.hasAuth || meta.cookieCount > 0 ? 1 : 0;
    const priority = normalizePriority(cc.priority);

    try {
      db.prepare(`
        INSERT INTO cases (
          id, team_id, created_by, name, description, tags_json, priority, source, script_path,
          legacy_path, default_environment_id, environment_snapshot_json, has_auth, metadata_json,
          portability, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cc.id,
        tid,
        resolveCatalogCreatedBy(cc.user_id),
        cc.name || cc.path || '用例',
        cc.description,
        JSON.stringify(meta.tags || []),
        priority,
        source,
        DEFAULT_SCRIPT,
        cc.path,
        cc.default_environment_id,
        cc.environment_snapshot_json,
        hasAuth,
        cc.metadata_json,
        cc.portability || 'portable',
        cc.created_at,
        cc.created_at,
      );

      if (meta.script) {
        writeScript(tid, cc.id, meta.script);
      } else {
        importLegacyFile(tid, cc.id, cc.path);
      }
      if (hasAuth && cc.path) {
        const dot = cc.path.lastIndexOf('.');
        const authLegacy = path.join(RECORDED_CASES_ROOT, `${dot > 0 ? cc.path.slice(0, dot) : cc.path}.auth.json`);
        if (fs.existsSync(authLegacy)) {
          try {
            writeAuth(tid, cc.id, JSON.parse(fs.readFileSync(authLegacy, 'utf8')));
          } catch (_) {}
        }
      }
      migrated += 1;
    } catch (e) {
      skipped += 1;
      console.warn(`[Schema] cases_v1 skip catalog#${cc.id}: ${e.message}`);
    }
  }

  db.exec(`CREATE TABLE IF NOT EXISTS _uiauto_migrations (name TEXT PRIMARY KEY);`);
  if (!db.prepare("SELECT 1 FROM _uiauto_migrations WHERE name = 'cases_v1'").get()) {
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('cases_v1')").run();
  }
  if (migrated > 0 || skipped > 0) {
    console.log(`[Schema] cases_v1 sync: +${migrated} rows, skipped ${skipped} (catalog total ${catalogRows.length})`);
  }
  seedCaseVersions();
}
