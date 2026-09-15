import { db } from '../db/schema.js';

export function loadUserRole(userId) {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(Number(userId));
  return row?.role || 'member';
}

export function requireSuperAdmin(req, res, next) {
  const role = loadUserRole(req.user?.id);
  if (role !== 'super_admin') {
    return res.status(403).json({ error: '需要平台超级管理员权限', code: 'SUPER_ADMIN_REQUIRED' });
  }
  req.platformRole = role;
  next();
}

/** 业务 API：须已加入至少一个空间且当前 team 有效 */
export function requireTeamContext(req, res, next) {
  if (!req.teamId) {
    return res.status(403).json({
      error: '尚未加入项目空间，请联系平台管理员开通',
      code: 'NO_TEAM',
    });
  }
  next();
}
