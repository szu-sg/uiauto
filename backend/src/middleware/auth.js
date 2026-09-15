import jwt from 'jsonwebtoken';
import { isAuthDisabled, devAuthUser } from './devAuth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';

/** @param {number | null | undefined} teamId — `undefined` 保留 user 上已有团队；`null` 表示清除当前空间 */
export function signToken(user, teamId = undefined) {
  const payload = {
    sub: user.id,
    username: user.username,
  };
  if (teamId !== undefined) {
    if (teamId != null && teamId !== '') {
      payload.current_team_id = Number(teamId);
    }
  } else if (user.current_team_id != null) {
    payload.current_team_id = Number(user.current_team_id);
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  if (isAuthDisabled()) {
    req.user = devAuthUser();
    return next();
  }
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      current_team_id: payload.current_team_id ?? null,
    };
    next();
  } catch (_) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export { isAuthDisabled };
