import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/schema.js';
import { signToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';

export const router = Router();

/** 注册：WPS 邮箱（可仅填前缀，归一化后须匹配） */
const WPS_EMAIL_RE = /^[a-zA-Z0-9._+-]{1,64}@wps\.cn$/i;
const UID_RE = /^[a-zA-Z0-9_-]{3,64}$/;
const SUPER_ADMIN_EMAILS = new Set(['wangjindong@wps.cn', 'wangjindong@wps']);

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

function userPublicRow(row) {
  if (!row) return null;
  const role = row.role && ROLE_LABEL[row.role] ? row.role : 'member';
  return {
    id: row.id,
    username: row.username,
    real_name: row.real_name || null,
    uid: row.uid || null,
    role,
    role_label: ROLE_LABEL[role] || ROLE_LABEL.member,
  };
}

/** 公开：注册始终开放（首用户仍会继承未归属计划） */
router.get('/bootstrap', (req, res) => {
  const n = userCount();
  const hasUsers = n > 0;
  res.json({
    allowRegister: true,
    needInvite: false,
    openRegister: true,
    hasUsers,
  });
});

router.post('/register', (req, res) => {
  const { username, password, real_name, uid } = req.body || {};
  const n = userCount();
  let u = String(username).trim();
  u = normalizeWpsLoginName(u).toLowerCase();
  const isSuperAdminEmail = SUPER_ADMIN_EMAILS.has(u);
  if (!username || !password) {
    return res.status(400).json({ error: '用户名与密码必填' });
  }
  if (!WPS_EMAIL_RE.test(u)) {
    return res.status(400).json({ error: '请使用 WPS 邮箱注册，格式：前缀@wps.cn' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const name = String(real_name || '').trim();
  if (!name || name.length < 2 || name.length > 32) {
    return res.status(400).json({ error: '姓名 2～32 位' });
  }
  const userUid = String(uid || '').trim();
  if (!UID_RE.test(userUid)) {
    return res.status(400).json({ error: 'UID 需为 3～64 位字母数字下划线或短横线' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u);
  if (exists) return res.status(409).json({ error: '用户名已存在' });
  const uidExists = db.prepare('SELECT id FROM users WHERE uid = ?').get(userUid);
  if (uidExists) return res.status(409).json({ error: 'UID 已存在' });
  const hash = bcrypt.hashSync(String(password), 10);
  const wasFirst = n === 0;
  const role = isSuperAdminEmail ? 'super_admin' : 'member';
  const r = db.prepare(
    'INSERT INTO users (username, password_hash, real_name, uid, role) VALUES (?, ?, ?, ?, ?)'
  ).run(u, hash, name, userUid, role);
  const userId = r.lastInsertRowid;
  if (wasFirst) {
    db.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').run(userId);
  }
  const token = signToken({ id: userId, username: u });
  const created = db.prepare(
    'SELECT id, username, real_name, uid, role FROM users WHERE id = ?'
  ).get(userId);
  res.status(201).json({ token, user: userPublicRow(created) });
});

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
  const token = signToken({ id: row.id, username: row.username });
  const pub = db.prepare('SELECT id, username, real_name, uid, role FROM users WHERE id = ?').get(row.id);
  res.json({ token, user: userPublicRow(pub) });
});

router.get('/me', (req, res) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.json({ user: null });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const row = db.prepare(
      'SELECT id, username, real_name, uid, role FROM users WHERE id = ?'
    ).get(payload.sub);
    res.json({ user: userPublicRow(row) });
  } catch (_) {
    res.json({ user: null });
  }
});
