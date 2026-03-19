import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/schema.js';
import { signToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';

export const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/;
const INVITE = process.env.UIAUTO_INVITE_CODE && String(process.env.UIAUTO_INVITE_CODE).trim();
const OPEN_REGISTER = ['1', 'true', 'yes'].includes(String(process.env.UIAUTO_OPEN_REGISTER || '').toLowerCase());

function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

/** 公开：是否允许注册（首用户 / 邀请码 / 内网开放注册） */
router.get('/bootstrap', (req, res) => {
  const n = userCount();
  const hasUsers = n > 0;
  const canRegister = n === 0 || !!INVITE || OPEN_REGISTER;
  res.json({
    allowRegister: canRegister,
    needInvite: hasUsers && !!INVITE && !OPEN_REGISTER,
    openRegister: hasUsers && OPEN_REGISTER,
    hasUsers,
  });
});

router.post('/register', (req, res) => {
  const { username, password, invite_code } = req.body || {};
  const n = userCount();
  if (n > 0) {
    if (OPEN_REGISTER) {
      /* 内网开放注册，不校验邀请码 */
    } else if (!INVITE) {
      return res.status(403).json({ error: '未开放注册。请管理员设置 UIAUTO_INVITE_CODE（邀请码）或 UIAUTO_OPEN_REGISTER=1（内网开放）。' });
    } else if (String(invite_code || '').trim() !== INVITE) {
      return res.status(403).json({ error: '邀请码不正确' });
    }
  }
  if (!username || !password) {
    return res.status(400).json({ error: '用户名与密码必填' });
  }
  const u = String(username).trim();
  if (!USERNAME_RE.test(u)) {
    return res.status(400).json({ error: '用户名 2～32 位，支持字母数字下划线与中文' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u);
  if (exists) return res.status(409).json({ error: '用户名已存在' });
  const hash = bcrypt.hashSync(String(password), 10);
  const wasFirst = n === 0;
  const r = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(u, hash);
  const userId = r.lastInsertRowid;
  if (wasFirst) {
    db.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').run(userId);
  }
  const token = signToken({ id: userId, username: u });
  res.status(201).json({ token, user: { id: userId, username: u } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名与密码必填' });
  }
  const u = String(username).trim();
  const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(u);
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken({ id: row.id, username: row.username });
  res.json({ token, user: { id: row.id, username: row.username } });
});

router.get('/me', (req, res) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.json({ user: null });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    res.json({ user: { id: payload.sub, username: payload.username } });
  } catch (_) {
    res.json({ user: null });
  }
});
