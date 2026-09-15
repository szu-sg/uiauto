import { Router } from 'express';
import { signToken } from '../middleware/auth.js';
import {
  listUserTeams,
  getTeam,
  createTeam,
  listTeamMembers,
  addTeamMember,
  updateMemberRole,
  removeTeamMember,
  getMemberRole,
  userBelongsToTeam,
  getTeamSummary,
  ROLE_RANK,
} from '../services/teamService.js';
import { listTeamInvites, removeTeamInvite } from '../services/teamInvites.js';
import { attachTeam, requireTeamRole } from '../middleware/teamAuth.js';
import { requireSuperAdmin } from '../middleware/platformAuth.js';

export const router = Router();

router.use(attachTeam);

/** 按 URL 中的 :id 校验成员在该空间的角色（勿用 JWT 当前空间 role） */
function requireRoleOnTeamParam(minRole) {
  const min = ROLE_RANK[minRole] ?? 0;
  return (req, res, next) => {
    const teamId = Number(req.params.id);
    if (!teamId || !userBelongsToTeam(req.user.id, teamId)) {
      return res.status(404).json({ error: '团队不存在' });
    }
    const role = getMemberRole(teamId, req.user.id);
    if ((ROLE_RANK[role] ?? -1) < min) {
      return res.status(403).json({ error: '权限不足', code: 'TEAM_FORBIDDEN' });
    }
    req.managedTeamId = teamId;
    req.managedTeamRole = role;
    next();
  };
}

router.get('/', (req, res) => {
  const teams = listUserTeams(req.user.id).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    role: t.role,
    member_count: t.member_count,
  }));
  res.json({
    teams,
    current_team_id: req.teamId,
  });
});

router.post('/', requireSuperAdmin, (req, res) => {
  try {
    const ownerUserId = Number(req.body?.owner_user_id ?? req.body?.ownerUserId);
    if (!ownerUserId) {
      return res.status(400).json({ error: 'owner_user_id 必填（空间管理员）' });
    }
    const team = createTeam(req.user.id, { ...req.body, owner_user_id: ownerUserId });
    res.status(201).json({
      team: { id: team.id, name: team.name, slug: team.slug },
    });
  } catch (e) {
    res.status(400).json({ error: e.message || '创建失败' });
  }
});

router.post('/switch', (req, res) => {
  const teamId = Number(req.body?.team_id ?? req.body?.teamId);
  if (!teamId) return res.status(400).json({ error: 'team_id 必填' });
  if (!userBelongsToTeam(req.user.id, teamId)) {
    return res.status(404).json({ error: '团队不存在' });
  }
  const token = signToken(
    { id: req.user.id, username: req.user.username },
    teamId,
  );
  const team = getTeam(teamId);
  res.json({
    ok: true,
    current_team_id: teamId,
    team: { id: team.id, name: team.name, slug: team.slug, role: getMemberRole(teamId, req.user.id) },
    token,
  });
});

router.get('/:id/summary', (req, res) => {
  const teamId = Number(req.params.id);
  if (!userBelongsToTeam(req.user.id, teamId)) {
    return res.status(404).json({ error: '团队不存在' });
  }
  try {
    res.json(getTeamSummary(teamId, req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message || '加载失败' });
  }
});

router.get('/:id', (req, res) => {
  const teamId = Number(req.params.id);
  if (!userBelongsToTeam(req.user.id, teamId)) {
    return res.status(404).json({ error: '团队不存在' });
  }
  const team = getTeam(teamId);
  res.json({
    ...team,
    role: getMemberRole(teamId, req.user.id),
    members: listTeamMembers(teamId),
  });
});

router.get('/:id/members', (req, res) => {
  const teamId = Number(req.params.id);
  if (!userBelongsToTeam(req.user.id, teamId)) {
    return res.status(404).json({ error: '团队不存在' });
  }
  res.json({
    members: listTeamMembers(teamId),
    pending_invites: listTeamInvites(teamId),
  });
});

router.post('/:id/members', requireRoleOnTeamParam('member'), (req, res) => {
  const teamId = Number(req.params.id);
  try {
    const body = req.body || {};
    const role = String(body.role || 'member').toLowerCase();
    const inviterRole = getMemberRole(teamId, req.user.id);
    if (role === 'admin' && (ROLE_RANK[inviterRole] ?? 0) < ROLE_RANK.admin) {
      return res.status(403).json({ error: '仅管理员可指定管理员角色' });
    }
    const result = addTeamMember(teamId, req.user.id, body);
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message || '邀请失败' });
  }
});

router.delete('/:id/invites/:inviteId', requireRoleOnTeamParam('admin'), (req, res) => {
  const teamId = Number(req.params.id);
  const inviteId = Number(req.params.inviteId);
  try {
    removeTeamInvite(teamId, inviteId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || '取消失败' });
  }
});

router.patch('/:id/members/:userId', requireRoleOnTeamParam('admin'), (req, res) => {
  const teamId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  try {
    updateMemberRole(teamId, targetUserId, req.body?.role);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || '更新失败' });
  }
});

router.delete('/:id/members/:userId', requireRoleOnTeamParam('admin'), (req, res) => {
  const teamId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  try {
    removeTeamMember(teamId, targetUserId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || '移除失败' });
  }
});
