import { db } from '../db/schema.js';
import { createCase, getCaseRecord } from './caseService.js';
import { loadAuth, readScript, writeAuth, writeEnvSnapshot } from './caseWorkspace.js';

function parseJson(raw, fallback = null) {
  if (raw == null || String(raw).trim() === '') return fallback;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

/** 合法文件夹名：含字母/数字/中文，拒绝纯 ? 或乱码 */
export function isValidFolderName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 64) return false;
  if (n === '—' || n === '-') return false;
  if (/^[\?？.\s_\-]+$/.test(n)) return false;
  if (!/[\w\u4e00-\u9fa5]/.test(n)) return false;
  return true;
}

function sanitizeBadFolders(teamId) {
  const folders = db.prepare('SELECT * FROM case_folders WHERE team_id = ?').all(Number(teamId));
  for (const f of folders) {
    if (isValidFolderName(f.name)) continue;
    db.prepare('UPDATE cases SET folder_id = NULL WHERE team_id = ? AND folder_id = ?').run(teamId, f.id);
    db.prepare('UPDATE case_folders SET parent_id = ? WHERE team_id = ? AND parent_id = ?').run(
      f.parent_id,
      teamId,
      f.id,
    );
    db.prepare('DELETE FROM case_folders WHERE id = ? AND team_id = ?').run(f.id, teamId);
  }
}

export function ensureCaseFoldersSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      parent_id INTEGER REFERENCES case_folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_case_folders_team ON case_folders(team_id);
    CREATE INDEX IF NOT EXISTS idx_case_folders_parent ON case_folders(team_id, parent_id);
  `);

  const cols = db.prepare('PRAGMA table_info(cases)').all().map((c) => c.name);
  if (!cols.includes('folder_id')) {
    db.exec('ALTER TABLE cases ADD COLUMN folder_id INTEGER REFERENCES case_folders(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cases_folder ON cases(team_id, folder_id)');
  }

  const migrated = db.prepare(
    "SELECT 1 FROM _uiauto_migrations WHERE name = 'case_folders_v1'",
  ).get();
  if (!migrated) {
    const teams = db.prepare('SELECT id FROM teams').all();
    for (const { id: teamId } of teams) {
      const modules = db.prepare(`
        SELECT DISTINCT json_extract(metadata_json, '$.module') AS module
        FROM cases
        WHERE team_id = ? AND status = 'active'
          AND json_extract(metadata_json, '$.module') IS NOT NULL
          AND TRIM(json_extract(metadata_json, '$.module')) != ''
      `).all(teamId);
      const folderByModule = new Map();
      let order = 0;
      for (const row of modules) {
        const name = String(row.module || '').trim();
        if (!isValidFolderName(name)) continue;
        const ins = db.prepare(
          'INSERT INTO case_folders (team_id, parent_id, name, sort_order) VALUES (?, NULL, ?, ?)',
        ).run(teamId, name, order++);
        folderByModule.set(name, Number(ins.lastInsertRowid));
      }
      const cases = db.prepare(
        "SELECT id, metadata_json FROM cases WHERE team_id = ? AND status = 'active' AND folder_id IS NULL",
      ).all(teamId);
      for (const c of cases) {
        const meta = parseJson(c.metadata_json, {});
        const module = String(meta.module || '').trim();
        if (!isValidFolderName(module)) continue;
        const folderId = folderByModule.get(module);
        if (folderId) {
          db.prepare('UPDATE cases SET folder_id = ? WHERE id = ? AND team_id = ?').run(folderId, c.id, teamId);
        }
      }
    }
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('case_folders_v1')").run();
  }

  const cleaned = db.prepare(
    "SELECT 1 FROM _uiauto_migrations WHERE name = 'case_folders_v2'",
  ).get();
  if (!cleaned) {
    const allTeams = db.prepare('SELECT id FROM teams').all();
    for (const { id: teamId } of allTeams) {
      sanitizeBadFolders(teamId);
    }
    db.prepare("INSERT OR IGNORE INTO _uiauto_migrations (name) VALUES ('case_folders_v2')").run();
  }
}

function getFolderRow(teamId, folderId) {
  return db.prepare(
    'SELECT * FROM case_folders WHERE id = ? AND team_id = ?',
  ).get(Number(folderId), Number(teamId));
}

function assertName(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('文件夹名称不能为空');
  if (!isValidFolderName(n)) throw new Error('文件夹名称无效，请使用中文、字母或数字');
  return n;
}

function assertUniqueName(teamId, parentId, name, excludeId = null) {
  const pid = parentId != null && parentId !== '' ? Number(parentId) : null;
  const rows = db.prepare(
    `SELECT id FROM case_folders
     WHERE team_id = ? AND name = ?
       AND ${pid == null ? 'parent_id IS NULL' : 'parent_id = ?'}`,
  ).all(...(pid == null ? [teamId, name] : [teamId, name, pid]));
  const conflict = rows.find((r) => r.id !== excludeId);
  if (conflict) throw new Error('同级目录下已存在同名文件夹');
}

function folderToApi(row, caseCount = 0) {
  return {
    id: row.id,
    team_id: row.team_id,
    parent_id: row.parent_id ?? null,
    name: row.name,
    sort_order: row.sort_order ?? 0,
    case_count: caseCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listFolderTree(teamId) {
  ensureCaseFoldersSchema();
  const tid = Number(teamId);
  const folders = db.prepare(
    'SELECT * FROM case_folders WHERE team_id = ? ORDER BY sort_order ASC, id ASC',
  ).all(tid);
  const counts = db.prepare(`
    SELECT folder_id, COUNT(*) AS n
    FROM cases
    WHERE team_id = ? AND status = 'active' AND folder_id IS NOT NULL
    GROUP BY folder_id
  `).all(tid);
  const countMap = new Map(counts.map((r) => [r.folder_id, r.n]));
  const uncategorized = db.prepare(
    "SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND status = 'active' AND folder_id IS NULL",
  ).get(tid)?.n ?? 0;
  const total = db.prepare(
    "SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND status = 'active'",
  ).get(tid)?.n ?? 0;

  const nodes = folders.map((f) => folderToApi(f, countMap.get(f.id) || 0));
  const byParent = new Map();
  for (const node of nodes) {
    const key = node.parent_id ?? 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }

  function build(parentKey) {
    return (byParent.get(parentKey) || []).map((node) => ({
      ...node,
      children: build(node.id),
    }));
  }

  return {
    total,
    uncategorized,
    tree: build(0),
  };
}

/** 按名称查找或创建根级文件夹（导入时模块 → 文件夹） */
export function findOrCreateFolderByName(teamId, name, { parent_id = null } = {}) {
  ensureCaseFoldersSchema();
  const folderName = assertName(name);
  const parentId = parent_id != null && parent_id !== '' ? Number(parent_id) : null;
  const existing = db.prepare(
    `SELECT * FROM case_folders
     WHERE team_id = ? AND name = ?
       AND ${parentId == null ? 'parent_id IS NULL' : 'parent_id = ?'}
     LIMIT 1`,
  ).get(...(parentId == null ? [teamId, folderName] : [teamId, folderName, parentId]));
  if (existing) return Number(existing.id);
  const created = createFolder(teamId, { name: folderName, parent_id: parentId });
  return Number(created.id);
}

export function createFolder(teamId, { name, parent_id = null } = {}) {
  ensureCaseFoldersSchema();
  const folderName = assertName(name);
  const parentId = parent_id != null && parent_id !== '' ? Number(parent_id) : null;
  if (parentId) {
    const parent = getFolderRow(teamId, parentId);
    if (!parent) throw new Error('父文件夹不存在');
  }
  assertUniqueName(teamId, parentId, folderName);
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM case_folders
     WHERE team_id = ? AND ${parentId == null ? 'parent_id IS NULL' : 'parent_id = ?'}`,
  ).get(...(parentId == null ? [teamId] : [teamId, parentId]));
  const r = db.prepare(
    'INSERT INTO case_folders (team_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)',
  ).run(teamId, parentId, folderName, (maxOrder?.m ?? -1) + 1);
  const row = getFolderRow(teamId, r.lastInsertRowid);
  return folderToApi(row, 0);
}

export function updateFolder(teamId, folderId, patch = {}) {
  ensureCaseFoldersSchema();
  const row = getFolderRow(teamId, folderId);
  if (!row) throw new Error('文件夹不存在');

  let parentId = row.parent_id;
  if (patch.parent_id !== undefined) {
    parentId = patch.parent_id != null && patch.parent_id !== '' ? Number(patch.parent_id) : null;
    if (parentId === Number(folderId)) throw new Error('不能将文件夹移动到自身');
    if (parentId) {
      const parent = getFolderRow(teamId, parentId);
      if (!parent) throw new Error('目标父文件夹不存在');
      let cursor = parent;
      while (cursor?.parent_id) {
        if (Number(cursor.parent_id) === Number(folderId)) {
          throw new Error('不能将文件夹移动到其子目录下');
        }
        cursor = getFolderRow(teamId, cursor.parent_id);
      }
    }
  }

  const name = patch.name != null ? assertName(patch.name) : row.name;
  assertUniqueName(teamId, parentId, name, Number(folderId));

  db.prepare(`
    UPDATE case_folders SET name = ?, parent_id = ?, updated_at = datetime('now', '+8 hours')
    WHERE id = ? AND team_id = ?
  `).run(name, parentId, folderId, teamId);

  const updated = getFolderRow(teamId, folderId);
  const caseCount = db.prepare(
    'SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND folder_id = ? AND status = ?',
  ).get(teamId, folderId, 'active')?.n ?? 0;
  return folderToApi(updated, caseCount);
}

export function deleteFolder(teamId, folderId, { moveCasesTo = null } = {}) {
  ensureCaseFoldersSchema();
  const row = getFolderRow(teamId, folderId);
  if (!row) throw new Error('文件夹不存在');

  const children = db.prepare(
    'SELECT id FROM case_folders WHERE team_id = ? AND parent_id = ?',
  ).all(teamId, folderId);
  for (const child of children) {
    deleteFolder(teamId, child.id, { moveCasesTo });
  }

  let targetFolderId = null;
  if (moveCasesTo === 'parent') {
    targetFolderId = row.parent_id ?? null;
  } else if (moveCasesTo != null && moveCasesTo !== '' && moveCasesTo !== 'null') {
    const dest = getFolderRow(teamId, moveCasesTo);
    if (!dest) throw new Error('目标文件夹不存在');
    targetFolderId = dest.id;
  }

  db.prepare(
    'UPDATE cases SET folder_id = ? WHERE team_id = ? AND folder_id = ?',
  ).run(targetFolderId, teamId, folderId);
  db.prepare('DELETE FROM case_folders WHERE id = ? AND team_id = ?').run(folderId, teamId);
  return { ok: true };
}

export function moveCasesToFolder(teamId, caseIds, folderId) {
  ensureCaseFoldersSchema();
  const ids = (Array.isArray(caseIds) ? caseIds : [])
    .map(Number)
    .filter((n) => n > 0);
  if (!ids.length) throw new Error('请选择要移动的用例');

  let fid = null;
  if (folderId != null && folderId !== '' && folderId !== 'null') {
    fid = Number(folderId);
    const folder = getFolderRow(teamId, fid);
    if (!folder) throw new Error('目标文件夹不存在');
  }

  const stmt = db.prepare(
    'UPDATE cases SET folder_id = ?, updated_at = datetime(\'now\', \'+8 hours\') WHERE id = ? AND team_id = ? AND status = ?',
  );
  let moved = 0;
  for (const id of ids) {
    const r = stmt.run(fid, id, teamId, 'active');
    if (r.changes) moved += 1;
  }
  if (!moved) throw new Error('未移动任何用例');
  return { moved, folder_id: fid };
}

export function copyCase(teamId, userId, caseId, { name: nameOverride, folder_id: folderId } = {}) {
  ensureCaseFoldersSchema();
  const row = getCaseRecord(teamId, caseId);
  if (!row) throw new Error('用例不存在');

  const meta = { ...(row.metadata || {}) };
  const script = meta.script || readScript(teamId, caseId, row.script_path || 'case.spec.ts') || '';
  if (!String(script).trim()) throw new Error('源用例脚本为空，无法复制');

  const baseName = String(nameOverride || row.name || '用例').trim() || '用例';
  const copyName = baseName.endsWith('(副本)') ? baseName : `${baseName} (副本)`;

  let fid = row.folder_id ?? null;
  if (folderId !== undefined) {
    if (folderId == null || folderId === '' || folderId === 'null') {
      fid = null;
    } else {
      fid = Number(folderId);
      if (!getFolderRow(teamId, fid)) throw new Error('目标文件夹不存在');
    }
  }

  const created = createCase(teamId, userId, {
    name: copyName,
    script,
    description: row.description,
    priority: row.priority,
    source: row.source || 'recorded',
    portability: row.portability || 'portable',
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
    default_environment_id: row.default_environment_id ?? null,
    environment_snapshot_json: row.environment_snapshot_json ?? null,
    storageState: loadAuth(teamId, caseId),
    metadata: { ...meta, script },
    folder_id: fid,
  });

  if (row.environment_snapshot_json && !row.default_environment_id) {
    const snap = parseJson(row.environment_snapshot_json, null);
    if (snap) writeEnvSnapshot(teamId, created.id, snap);
  }

  return created;
}
