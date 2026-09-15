import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/schema.js';
import { signToken } from '../middleware/auth.js';
import { isAuthDisabled, ensureDevUser } from '../middleware/devAuth.js';
import { getAuthorizeUrl, exchangeCodeForUser } from '../services/wpsOAuth.js';
import {
  getMemberRole,
  listUserTeams,
  resolveCurrentTeamId,
} from '../services/teamService.js';
import { applyPendingInvitesForUser } from '../services/teamInvites.js';

const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';

export const router = Router();

const WPS_EMAIL_RE = /^[a-zA-Z0-9._+-]{1,64}@wps\.cn$/i;
const UID_RE = /^[a-zA-Z0-9_-]{3,64}$/;

function getSuperAdminEmails() {
  const raw = process.env.WPS_SUPER_ADMIN_EMAILS || 'wangjindong@wps.cn,wangjindong@wps';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

function normalizeWpsLoginName(raw) {
  const t = String(raw || '').trim();
  if (!t) return t;
  if (!t.includes('@')) return `${t}@wps.cn`;
  return t;
}

function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

const ROLE_LABEL = { member: '成员', admin: '管理员', super_admin: '超级管理员', user: '成员' };

function userPublicRow(row, teamContext = null) {
  if (!row) return null;
  const role = row.role && ROLE_LABEL[row.role] ? row.role : 'member';
  const base = {
    id: row.id,
    username: row.username,
    real_name: row.real_name || null,
    uid: row.uid || null,
    role,
    role_label: ROLE_LABEL[role] || ROLE_LABEL.member,
    avatar: row.avatar || null,
    email: row.email || null,
  };
  if (teamContext) {
    base.current_team_id = teamContext.current_team_id;
    base.teams = teamContext.teams;
    if (teamContext.current_team_role) {
      base.current_team_role = teamContext.current_team_role;
    }
  }
  return base;
}

function oauthPlaceholderHash(oauthUid) {
  return bcrypt.hashSync(`oauth:${oauthUid}`, 10);
}

/** OAuth 登录：按 oauth_uid / 邮箱 / 用户名匹配，不存在则创建 */
function upsertOAuthUser(info) {
  const oauthUid = String(info.uid || '').trim();
  const email = String(info.email || '').trim().toLowerCase();
  const nickname = String(info.nickname || '').trim() || oauthUid;
  const companyUid = String(info.company_uid || '').trim();
  const wpsUid = info.wps_uid != null && Number.isFinite(info.wps_uid) ? info.wps_uid : null;
  const avatar = String(info.avatar || '').trim() || null;
  const notifyUid = companyUid || (wpsUid != null ? String(wpsUid) : '') || oauthUid;

  let row = oauthUid
    ? db.prepare('SELECT * FROM users WHERE oauth_uid = ?').get(oauthUid)
    : null;
  if (!row && email) {
    row = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);
  }

  if (row) {
    db.prepare(`
      UPDATE users SET
        oauth_uid = COALESCE(?, oauth_uid),
        wps_uid = ?,
        real_name = ?,
        avatar = ?,
        email = ?,
        uid = COALESCE(?, uid)
      WHERE id = ?
    `).run(oauthUid || row.oauth_uid, wpsUid, nickname, avatar, email || row.email, notifyUid || row.uid, row.id);
    const updated = db.prepare('SELECT id, username, real_name, uid, role, email FROM users WHERE id = ?').get(row.id);
    applyPendingInvitesForUser(updated.id, updated.email || email);
    return db.prepare('SELECT id, username, real_name, uid, role FROM users WHERE id = ?').get(row.id);
  }

  let username = email;
  if (!username || !WPS_EMAIL_RE.test(username)) {
    username = oauthUid ? `oauth_${oauthUid}@wps.cn` : `oauth_${Date.now()}@wps.cn`;
  }
  const isSuperAdmin = email && getSuperAdminEmails().has(email.toLowerCase());
  const role = isSuperAdmin ? 'super_admin' : 'member';
  const hash = oauthPlaceholderHash(oauthUid || username);

  const r = db.prepare(
    `INSERT INTO users (username, password_hash, real_name, uid, role, oauth_uid, wps_uid, avatar, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(username, hash, nickname, notifyUid || null, role, oauthUid || null, wpsUid, avatar, email || null);

  const userId = r.lastInsertRowid;
  if (userCount() === 1) {
    db.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').run(userId);
  }
  applyPendingInvitesForUser(userId, email || username);
  return db.prepare('SELECT id, username, real_name, uid, role FROM users WHERE id = ?').get(userId);
}

router.get('/bootstrap', (req, res) => {
  const n = userCount();
  res.json({
    oauthEnabled: !isAuthDisabled(),
    authDisabled: isAuthDisabled(),
    allowRegister: false,
    needInvite: false,
    openRegister: false,
    hasUsers: n > 0,
    loginMode: isAuthDisabled() ? 'dev' : 'wps_sso',
  });
});

/** 退出登录（客户端清除 JWT；服务端无状态） */
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

/** WPS OAuth2 授权页 URL */
router.get('/login-url', (req, res) => {
  const state = String(req.query.state || '');
  res.json({ url: getAuthorizeUrl(state) });
});

/** OAuth 回调：用 code 换用户信息并签发 JWT（access_token 不返回前端） */
router.post('/callback', async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code 不能为空' });
  try {
    const oauthUser = await exchangeCodeForUser(code);
    const row = upsertOAuthUser(oauthUser);
    const teamId = resolveCurrentTeamId(row.id, null);
    const token = signToken({ id: row.id, username: row.username }, teamId);
    const pub = db.prepare(
      'SELECT id, username, real_name, uid, role, avatar, email FROM users WHERE id = ?'
    ).get(row.id);
    const teams = listUserTeams(row.id).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      role: t.role,
    }));
    const currentTeamRole = getMemberRole(teamId, row.id);
    res.json({
      ok: true,
      token,
      current_team_id: teamId,
      current_team_role: currentTeamRole,
      user: userPublicRow(pub, {
        current_team_id: teamId,
        teams,
        current_team_role: currentTeamRole,
      }),
    });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || '登录失败' });
  }
});

/** 保留：本地密码登录（兼容旧账号，前端不再展示） */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名与密码必填' });
  }
  const raw = String(username).trim();
  const tryNames = new Set([raw, raw.toLowerCase()]);
  if (!raw.includes('@')) {
    tryNames.add(normalizeWpsLoginName(raw).toLowerCase());
  }
  let row;
  for (const name of tryNames) {
    if (!name) continue;
    row = db.prepare(
      'SELECT id, username, password_hash, real_name, uid, role FROM users WHERE username = ?'
    ).get(name);
    if (row) break;
  }
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const teamId = resolveCurrentTeamId(row.id, null);
  const token = signToken({ id: row.id, username: row.username }, teamId);
  const pub = db.prepare(
    'SELECT id, username, real_name, uid, role, avatar, email FROM users WHERE id = ?'
  ).get(row.id);
  res.json({ token, user: userPublicRow(pub) });
});

router.post('/register', (req, res) => {
  res.status(403).json({ error: '已启用 WPS SSO 登录，请使用企业账号授权登录' });
});

router.get('/me', (req, res) => {
  if (isAuthDisabled()) {
    const row = ensureDevUser();
    const teamId = resolveCurrentTeamId(row.id, null);
    const teams = listUserTeams(row.id).map((t) => ({
      id: t.id, name: t.name, slug: t.slug, role: t.role,
    }));
    const currentTeamRole = getMemberRole(teamId, row.id);
    return res.json({
      user: userPublicRow(row, {
        current_team_id: teamId,
        teams,
        current_team_role: currentTeamRole,
      }),
      current_team_id: teamId,
      current_team_role: currentTeamRole,
    });
  }
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.json({ user: null });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const row = db.prepare(
      'SELECT id, username, real_name, uid, role, avatar, email FROM users WHERE id = ?'
    ).get(payload.sub);
    if (!row) return res.json({ user: null });
    const teamId = resolveCurrentTeamId(row.id, payload.current_team_id);
    const teams = listUserTeams(row.id).map((t) => ({
      id: t.id, name: t.name, slug: t.slug, role: t.role,
    }));
    const currentTeamRole = getMemberRole(teamId, row.id);
    res.json({
      user: userPublicRow(row, {
        current_team_id: teamId,
        teams,
        current_team_role: currentTeamRole,
      }),
      current_team_id: teamId,
      current_team_role: currentTeamRole,
    });
  } catch (_) {
    res.json({ user: null });
  }
});
