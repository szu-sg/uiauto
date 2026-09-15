import { Router } from 'express';
import { db } from '../db/schema.js';

export const router = Router();

const KINDS = new Set(['test', 'staging', 'private']);

function teamRoleRank(role) {
  const map = { viewer: 0, member: 1, admin: 2, owner: 3 };
  return map[role] ?? -1;
}

/** 创建人可改删；空间 admin/owner 可改删任意环境 */
function canManageEnvironment(req, row) {
  if (!row) return false;
  if (Number(row.user_id) === Number(req.user.id)) return true;
  const rank = teamRoleRank(req.teamRole);
  return rank >= teamRoleRank('admin');
}

const CREATOR_JOIN = `
  u.real_name AS creator_name,
  u.avatar AS creator_avatar,
  u.email AS creator_email,
  u.uid AS creator_uid
`;

function parseHeaders(raw) {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr
          .filter((h) => h && typeof h === 'object' && h.name != null)
          .map((h) => ({ name: String(h.name).trim(), value: h.value != null ? String(h.value) : '' }))
      : [];
  } catch (_) {
    return [];
  }
}

function parseExtraEnv(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

/** GET 列表与详情：不返回明文密码 */
function rowToPublic(row, currentUserId, includePasswordHint) {
  if (!row) return null;
  const headers = parseHeaders(row.headers_json);
  const extra = parseExtraEnv(row.extra_env_json);
  const isOwner = Number(row.user_id) === Number(currentUserId);
  return {
    id: row.id,
    user_id: row.user_id,
    is_owner: isOwner,
    name: row.name,
    env_kind: row.env_kind,
    base_url: row.base_url && String(row.base_url).trim() && String(row.base_url).trim() !== 'null'
      ? String(row.base_url).trim()
      : '',
    headers,
    extra_env: extra,
    test_username: row.test_username || '',
    wps_company_name: row.wps_company_name || '',
    switchhosts_text: row.switchhosts_text != null ? String(row.switchhosts_text) : '',
    password_set: includePasswordHint ? !!(row.test_password && String(row.test_password).length) : undefined,
    created_at: row.created_at || null,
    created_by: row.user_id ? {
      id: row.user_id,
      real_name: row.creator_name || null,
      avatar: row.creator_avatar || null,
      email: row.creator_email || null,
      uid: row.creator_uid || null,
    } : null,
  };
}

function fetchEnvRow(id) {
  return db.prepare(
    `SELECT e.*, ${CREATOR_JOIN}
     FROM execution_environments e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.id = ?`,
  ).get(id);
}

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT e.*, ${CREATOR_JOIN}
     FROM execution_environments e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.team_id = ?
     ORDER BY e.created_at DESC`,
  ).all(req.teamId);
  res.json(rows.map((r) => rowToPublic(r, req.user.id, true)));
});

router.post('/', (req, res) => {
  const { name, env_kind, base_url, headers, test_username, test_password, extra_env, switchhosts_text, wps_company_name } =
    req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: '名称必填' });
  }
  const kind = KINDS.has(String(env_kind || '').toLowerCase()) ? String(env_kind).toLowerCase() : 'test';
  const headersJson = Array.isArray(headers) ? JSON.stringify(headers) : '[]';
  const extraJson =
    extra_env && typeof extra_env === 'object' && !Array.isArray(extra_env) ? JSON.stringify(extra_env) : '{}';
  const shRaw =
    switchhosts_text !== undefined && switchhosts_text != null && String(switchhosts_text).trim()
      ? String(switchhosts_text)
      : null;
  const shStored = kind === 'test' ? shRaw : null;
  const wpsCo =
    wps_company_name != null && String(wps_company_name).trim() ? String(wps_company_name).trim() : null;
  const r = db
    .prepare(
      `INSERT INTO execution_environments (user_id, team_id, name, env_kind, base_url, headers_json, test_username, test_password, extra_env_json, switchhosts_text, wps_company_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.user.id,
      req.teamId,
      String(name).trim(),
      kind,
      base_url != null && String(base_url).trim() ? String(base_url).trim() : null,
      headersJson,
      test_username != null && String(test_username).trim() ? String(test_username).trim() : null,
      test_password != null && String(test_password) ? String(test_password) : null,
      extraJson,
      shStored,
      wpsCo,
    );
  const id = r.lastInsertRowid;
  const row = fetchEnvRow(id);
  res.status(201).json(rowToPublic(row, req.user.id, true));
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = fetchEnvRow(id);
  if (!row || Number(row.team_id) !== Number(req.teamId)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(rowToPublic(row, req.user.id, true));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM execution_environments WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!existing) return res.status(404).json({ error: '环境不存在' });
  if (!canManageEnvironment(req, existing)) {
    return res.status(403).json({ error: '仅创建人或空间管理员可编辑该环境' });
  }

  const { name, env_kind, base_url, headers, test_username, test_password, extra_env, switchhosts_text, wps_company_name } =
    req.body || {};
  const nextName = name !== undefined ? String(name).trim() : existing.name;
  if (!nextName) return res.status(400).json({ error: '名称不能为空' });
  const kind =
    env_kind !== undefined
      ? KINDS.has(String(env_kind).toLowerCase())
        ? String(env_kind).toLowerCase()
        : existing.env_kind
      : existing.env_kind;
  const headersJson =
    headers !== undefined ? (Array.isArray(headers) ? JSON.stringify(headers) : existing.headers_json) : existing.headers_json;
  const extraJson =
    extra_env !== undefined
      ? extra_env && typeof extra_env === 'object' && !Array.isArray(extra_env)
        ? JSON.stringify(extra_env)
        : existing.extra_env_json
      : existing.extra_env_json;

  let pwd = existing.test_password;
  if (test_password !== undefined) {
    pwd = String(test_password).length ? String(test_password) : null;
  }

  const nextBase =
    base_url !== undefined ? (String(base_url).trim() || null) : existing.base_url;
  const nextUser =
    test_username !== undefined ? (String(test_username).trim() || null) : existing.test_username;

  let nextSwitch = existing.switchhosts_text ?? null;
  if (switchhosts_text !== undefined) {
    const trimmed = String(switchhosts_text).trim();
    nextSwitch = trimmed ? trimmed : null;
  }
  if (kind !== 'test') {
    nextSwitch = null;
  }

  const nextWpsCompany =
    wps_company_name !== undefined
      ? String(wps_company_name).trim() || null
      : existing.wps_company_name ?? null;

  db.prepare(
    `UPDATE execution_environments SET name = ?, env_kind = ?, base_url = ?, headers_json = ?, test_username = ?, test_password = ?, extra_env_json = ?, switchhosts_text = ?, wps_company_name = ?
     WHERE id = ? AND team_id = ?`,
  ).run(nextName, kind, nextBase, headersJson, nextUser, pwd, extraJson, nextSwitch, nextWpsCompany, id, req.teamId);
  const row = fetchEnvRow(id);
  res.json(rowToPublic(row, req.user.id, true));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM execution_environments WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!row) return res.status(404).json({ error: '环境不存在' });
  if (!canManageEnvironment(req, row)) {
    return res.status(403).json({ error: '仅创建人或空间管理员可删除该环境' });
  }
  db.prepare('UPDATE plans SET environment_id = NULL WHERE environment_id = ?').run(id);
  db.prepare('DELETE FROM execution_environments WHERE id = ? AND team_id = ?').run(id, req.teamId);
  res.json({ deleted: true });
});
