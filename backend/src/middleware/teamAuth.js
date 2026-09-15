import {
  getMemberRole,
  resolveCurrentTeamId,
  ROLE_RANK,
  userBelongsToTeam,
  isTeamActive,
} from '../services/teamService.js';

export function attachTeam(req, res, next) {
  const headerTeam = req.headers['x-team-id'];
  const jwtTeam = req.user?.current_team_id;
  const preferred = headerTeam != null && headerTeam !== '' ? headerTeam : jwtTeam;
  try {
    const teamId = resolveCurrentTeamId(req.user.id, preferred);
    if (teamId != null && (!userBelongsToTeam(req.user.id, teamId) || !isTeamActive(teamId))) {
      return res.status(403).json({ error: '无权访问该团队' });
    }
    req.teamId = teamId ?? null;
    req.teamRole = teamId ? getMemberRole(teamId, req.user.id) : null;
    next();
  } catch (e) {
    res.status(400).json({ error: e.message || '团队上下文无效' });
  }
}

function teamForbidden(res) {
  return res.status(403).json({ error: '权限不足', code: 'TEAM_FORBIDDEN' });
}

export function requireTeamRole(minRole) {
  const min = ROLE_RANK[minRole] ?? 0;
  return (req, res, next) => {
    const role = req.teamRole || getMemberRole(req.teamId, req.user.id);
    if ((ROLE_RANK[role] ?? -1) < min) {
      return teamForbidden(res);
    }
    next();
  };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * REQ-B07：当前空间内 viewer 只读；member+ 可写。
 * 须在 attachTeam 之后使用。teams 路由单独处理（创建/切换空间不受当前空间写权限限制）。
 */
export function enforceTeamPermissions(req, res, next) {
  const role = req.teamRole || getMemberRole(req.teamId, req.user.id);
  if (!role) {
    return teamForbidden(res);
  }
  const rank = ROLE_RANK[role] ?? -1;
  if (READ_METHODS.has(req.method)) {
    if (rank < ROLE_RANK.viewer) return teamForbidden(res);
    return next();
  }
  if (rank < ROLE_RANK.member) {
    // 只读成员可在团队内创建/维护自己的执行环境（具体归属在 environments 路由校验）
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (path.startsWith('/api/environments')) return next();
    return teamForbidden(res);
  }
  return next();
}
