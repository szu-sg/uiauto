import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (_) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
