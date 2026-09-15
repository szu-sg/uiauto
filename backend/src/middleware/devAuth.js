import bcrypt from 'bcryptjs';
import { db } from '../db/schema.js';
import { createTeam, resolveTeamIdForUser } from '../services/teamService.js';

export function isAuthDisabled() {
  const v = String(process.env.AUTH_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** 本地免登录时使用的用户（优先第一个账号，否则自动创建） */
export function ensureDevUser() {
  let row = db.prepare(
    'SELECT id, username, real_name, uid, role, avatar, email FROM users ORDER BY id LIMIT 1'
  ).get();
  if (row) return row;

  const username = 'local-dev@wps.cn';
  const hash = bcrypt.hashSync('local-dev-no-login', 10);
  const r = db.prepare(
    `INSERT INTO users (username, password_hash, real_name, uid, role, email)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(username, hash, '本地测试', 'local-dev', 'super_admin', username);
  db.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').run(r.lastInsertRowid);
  createTeam(r.lastInsertRowid, {
    name: '本地开发空间',
    slug: 'local-dev',
    owner_user_id: r.lastInsertRowid,
  });
  return db.prepare(
    'SELECT id, username, real_name, uid, role, avatar, email FROM users WHERE id = ?'
  ).get(r.lastInsertRowid);
}

export function devAuthUser() {
  const row = ensureDevUser();
  const teamId = resolveTeamIdForUser(row.id);
  return { id: row.id, username: row.username, current_team_id: teamId };
}
