import { Router } from 'express';
import { requireSuperAdmin } from '../middleware/platformAuth.js';
import {
  createTeam,
  listAllTeams,
  listTeamMembers,
  lookupUsers,
  getPlatformAdminStats,
  closeTeam,
  updateTeamNameBySuperAdmin,
  listAllUsersForAdmin,
  listAllPlansForAdmin,
} from '../services/teamService.js';

export const router = Router();

router.use(requireSuperAdmin);

router.get('/stats', (_req, res) => {
  res.json(getPlatformAdminStats());
});

router.get('/users', (_req, res) => {
  res.json({ users: listAllUsersForAdmin() });
});

router.get('/plans', (_req, res) => {
  res.json({ plans: listAllPlansForAdmin() });
});

router.get('/teams', (_req, res) => {
  res.json({ teams: listAllTeams() });
});

router.post('/teams', (req, res) => {
  try {
    const ownerUserId = Number(req.body?.owner_user_id ?? req.body?.ownerUserId);
    if (!ownerUserId) {
      return res.status(400).json({ error: 'owner_user_id 必填（空间管理员）' });
    }
    const team = createTeam(req.user.id, {
      name: req.body?.name,
      slug: req.body?.slug,
      owner_user_id: ownerUserId,
    });
    res.status(201).json({ team });
  } catch (e) {
    res.status(400).json({ error: e.message || '创建失败' });
  }
});

router.get('/users/lookup', (req, res) => {
  try {
    const q = req.query.q ?? req.query.query ?? '';
    const users = lookupUsers(q);
    res.json({ users });
  } catch (e) {
    res.status(400).json({ error: e.message || '查询失败' });
  }
});

router.get('/teams/:id/members', (req, res) => {
  const teamId = Number(req.params.id);
  if (!teamId) return res.status(400).json({ error: '无效 id' });
  res.json({ members: listTeamMembers(teamId) });
});

router.patch('/teams/:id', (req, res) => {
  const teamId = Number(req.params.id);
  if (!teamId) return res.status(400).json({ error: '无效 id' });
  try {
    const team = updateTeamNameBySuperAdmin(teamId, req.body?.name);
    res.json({ team: { id: team.id, name: team.name, slug: team.slug } });
  } catch (e) {
    res.status(400).json({ error: e.message || '更新失败' });
  }
});

router.post('/teams/:id/close', (req, res) => {
  const teamId = Number(req.params.id);
  if (!teamId) return res.status(400).json({ error: '无效 id' });
  try {
    const team = closeTeam(teamId);
    res.json({ ok: true, team: { id: team.id, status: team.status } });
  } catch (e) {
    res.status(400).json({ error: e.message || '关闭失败' });
  }
});
