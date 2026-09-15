import { db } from '../db/schema.js';
import { createTeamInvite } from './teamInvites.js';

export const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

function slugify(name, userId) {
  const base = String(name || 'team')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'team';
  let slug = base;
  let n = 0;
  while (db.prepare('SELECT 1 FROM teams WHERE slug = ?').get(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export function getMemberRole(teamId, userId) {
  const row = db.prepare(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
  ).get(Number(teamId), Number(userId));
  return row?.role || null;
}

export function userBelongsToTeam(userId, teamId) {
  return !!getMemberRole(teamId, userId);
}

export function isTeamActive(teamId) {
  const team = getTeam(teamId);
  if (!team) return false;
  const status = team.status || 'active';
  return status !== 'closed';
}

export function listUserTeams(userId) {
  return db.prepare(`
    SELECT t.id, t.name, t.slug, tm.role,
      (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count
    FROM teams t
    INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
    WHERE COALESCE(t.status, 'active') != 'closed'
    ORDER BY CASE WHEN t.slug LIKE 'personal-%' THEN 1 ELSE 0 END ASC, t.id ASC
  `).all(Number(userId));
}

export function getTeam(teamId) {
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(teamId));
}

/** 仅平台超管可改空间名称 */
export function updateTeamNameBySuperAdmin(teamId, name) {
  const teamName = String(name || '').trim();
  if (!teamName) throw new Error('团队名称必填');
  const tid = Number(teamId);
  const team = getTeam(tid);
  if (!team) throw new Error('团队不存在');
  db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(teamName, tid);
  return getTeam(tid);
}

/**
 * 创建协作空间。ownerUserId 为空间所有者（须已存在用户）；createdBy 为操作人（超管）。
 */
export function createTeam(createdByUserId, { name, slug, owner_user_id, ownerUserId }) {
  const teamName = String(name || '').trim();
  if (!teamName) throw new Error('团队名称必填');
  const ownerId = Number(owner_user_id ?? ownerUserId ?? createdByUserId);
  if (!ownerId) throw new Error('须指定空间管理员（owner_user_id）');
  const ownerRow = db.prepare('SELECT id FROM users WHERE id = ?').get(ownerId);
  if (!ownerRow) throw new Error('空间管理员尚未登录过平台，请先让对方完成 SSO');
  const teamSlug = slug && String(slug).trim()
    ? String(slug).trim().toLowerCase()
    : slugify(teamName, null);
  if (db.prepare('SELECT 1 FROM teams WHERE slug = ?').get(teamSlug)) {
    throw new Error('团队标识已被占用');
  }
  const actorId = Number(createdByUserId);
  const r = db.prepare(
    'INSERT INTO teams (name, slug, created_by) VALUES (?, ?, ?)',
  ).run(teamName, teamSlug, actorId);
  const teamId = Number(r.lastInsertRowid);
  db.prepare(
    'INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
  ).run(teamId, ownerId, 'owner', actorId);
  return getTeam(teamId);
}

export function listAllTeams() {
  return db.prepare(`
    SELECT t.id, t.name, t.slug, t.created_at, t.created_by, COALESCE(t.status, 'active') AS status,
      (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count,
      (SELECT u.real_name FROM team_members tm
        INNER JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = t.id AND tm.role = 'owner' LIMIT 1) AS owner_name
    FROM teams t
    ORDER BY t.id DESC
  `).all();
}

export function closeTeam(teamId) {
  const tid = Number(teamId);
  const team = getTeam(tid);
  if (!team) throw new Error('团队不存在');
  if ((team.status || 'active') === 'closed') throw new Error('空间已关闭');
  db.prepare("UPDATE teams SET status = 'closed', updated_at = datetime('now', '+8 hours') WHERE id = ?").run(tid);
  db.prepare('DELETE FROM team_invites WHERE team_id = ?').run(tid);
  return getTeam(tid);
}

/** 超管平台概览（用户数 = 至少登录过一次 SSO/账号） */
export function getPlatformAdminStats() {
  const total_users = db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n ?? 0;
  const total_teams = db.prepare('SELECT COUNT(*) AS n FROM teams').get()?.n ?? 0;
  const users_in_spaces = db.prepare(
    'SELECT COUNT(DISTINCT user_id) AS n FROM team_members',
  ).get()?.n ?? 0;
  return { total_users, total_teams, users_in_spaces };
}

export function listAllUsersForAdmin() {
  return db.prepare(`
    SELECT u.id, u.real_name, u.username, u.email, u.role, u.uid, u.created_at,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.user_id = u.id) AS team_count
    FROM users u
    ORDER BY u.id DESC
  `).all();
}

export function listAllPlansForAdmin() {
  return db.prepare(`
    SELECT p.id, p.name, p.team_id, p.enabled, p.schedule_enabled, p.created_at,
      t.name AS team_name,
      (SELECT COUNT(*) FROM runs r WHERE r.plan_id = p.id) AS run_count
    FROM plans p
    LEFT JOIN teams t ON t.id = p.team_id
    ORDER BY p.id DESC
    LIMIT 500
  `).all();
}

export function resolveTeamIdForUser(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const row = db.prepare(
    'SELECT team_id FROM team_members WHERE user_id = ? ORDER BY team_id ASC LIMIT 1',
  ).get(uid);
  return row?.team_id ? Number(row.team_id) : null;
}

/** @deprecated REQ-B11：不再自动创建个人空间 */
export function ensureDefaultTeam(_userId, _displayName) {
  return null;
}

export function backfillTeamIdForUser(userId, teamId) {
  const uid = Number(userId);
  const tid = Number(teamId);
  const tables = [
    ['case_catalog', 'user_id'],
    ['cases', 'created_by'],
    ['plans', 'user_id'],
    ['execution_environments', 'user_id'],
    ['recorded_runs', 'user_id'],
  ];
  for (const [table, col] of tables) {
    try {
      db.prepare(`UPDATE ${table} SET team_id = ? WHERE ${col} = ? AND (team_id IS NULL OR team_id = '')`).run(tid, uid);
    } catch (_) {}
  }
  try {
    db.prepare(`
      UPDATE runs SET team_id = ?
      WHERE plan_id IN (SELECT id FROM plans WHERE user_id = ?)
        AND (team_id IS NULL OR team_id = '')
    `).run(tid, uid);
  } catch (_) {}
}

export function resolveCurrentTeamId(userId, preferredTeamId) {
  const uid = Number(userId);
  if (preferredTeamId != null && preferredTeamId !== '') {
    const tid = Number(preferredTeamId);
    if (userBelongsToTeam(uid, tid)) return tid;
  }
  const teams = listUserTeams(uid);
  if (teams.length === 0) return null;
  const preferredProject = teams.find((t) => !isPersonalTeamSlug(t.slug));
  return preferredProject ? preferredProject.id : teams[0].id;
}

export function listTeamMembers(teamId) {
  return db.prepare(`
    SELECT tm.user_id, tm.role, tm.joined_at,
      u.real_name, u.username, u.email, u.avatar, u.uid
    FROM team_members tm
    INNER JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.role DESC, tm.joined_at ASC
  `).all(Number(teamId));
}

export function isPersonalTeamSlug(slug) {
  return String(slug || '').startsWith('personal-');
}

export function addTeamMember(teamId, inviterId, { email, user_id, role = 'member', real_name }) {
  const team = getTeam(teamId);
  if (!team || !isTeamActive(teamId)) throw new Error('团队不存在');
  const r = String(role || 'member').toLowerCase();
  if (!ROLE_RANK[r]) throw new Error('无效角色');
  if (r === 'owner') throw new Error('不能通过邀请设置所有者');
  let user;
  if (user_id != null && user_id !== '') {
    user = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(user_id));
    if (!user) throw new Error('用户不存在');
    if (db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, user.id)) {
      throw new Error('该用户已是团队成员');
    }
    db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
    ).run(Number(teamId), user.id, r, Number(inviterId));
    return { user_id: user.id, pending: false };
  }
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) throw new Error('邮箱必填');
  user = db.prepare(
    'SELECT id FROM users WHERE email = ? OR username = ?',
  ).get(mail, mail);
  if (user) {
    if (db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, user.id)) {
      throw new Error('该用户已是团队成员');
    }
    db.prepare(
      'INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
    ).run(Number(teamId), user.id, r, Number(inviterId));
    return { user_id: user.id, pending: false };
  }
  const invite = createTeamInvite(teamId, inviterId, { email: mail, real_name, role: r });
  return { pending: true, invite_id: invite.id };
}

export function updateMemberRole(teamId, targetUserId, role) {
  const r = String(role || '').toLowerCase();
  if (!ROLE_RANK[r]) throw new Error('无效角色');
  const cur = getMemberRole(teamId, targetUserId);
  if (!cur) throw new Error('成员不存在');
  if (cur === 'owner' && r !== 'owner') {
    const owners = db.prepare(
      "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role = 'owner'",
    ).get(teamId).n;
    if (owners <= 1) throw new Error('至少保留一名所有者');
  }
  db.prepare(
    'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
  ).run(r, Number(teamId), Number(targetUserId));
}

export function removeTeamMember(teamId, targetUserId) {
  const role = getMemberRole(teamId, targetUserId);
  if (!role) throw new Error('成员不存在');
  if (role === 'owner') {
    const owners = db.prepare(
      "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role = 'owner'",
    ).get(teamId).n;
    if (owners <= 1) throw new Error('不能移除唯一所有者');
  }
  db.prepare(
    'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
  ).run(Number(teamId), Number(targetUserId));
}

export function assertTeamResource(table, id, teamId) {
  const row = db.prepare(`SELECT team_id FROM ${table} WHERE id = ?`).get(Number(id));
  if (!row || Number(row.team_id) !== Number(teamId)) {
    return false;
  }
  return true;
}

export function lookupUsers(query, limit = 10) {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('请输入至少 2 个字符');
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const like = `%${q}%`;
  return db.prepare(`
    SELECT id, real_name, username, email, uid, avatar
    FROM users
    WHERE email LIKE ? COLLATE NOCASE
       OR username LIKE ? COLLATE NOCASE
       OR real_name LIKE ? COLLATE NOCASE
       OR uid = ?
    ORDER BY id ASC
    LIMIT ?
  `).all(like, like, like, q, cap);
}

export function getTeamSummary(teamId, userId) {
  const tid = Number(teamId);
  if (!userBelongsToTeam(userId, tid)) throw new Error('团队不存在');
  const team = getTeam(tid);
  const myRole = getMemberRole(tid, userId);
  const memberCount = db.prepare(
    'SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?',
  ).get(tid).n;
  const cases = db.prepare('SELECT COUNT(*) AS n FROM cases WHERE team_id = ?').get(tid)?.n ?? 0;
  let plans = 0;
  try {
    plans = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE team_id = ?').get(tid)?.n ?? 0;
  } catch (_) {}
  let environments = 0;
  try {
    environments = db.prepare(
      'SELECT COUNT(*) AS n FROM execution_environments WHERE team_id = ?',
    ).get(tid)?.n ?? 0;
  } catch (_) {}
  let lastRunAt = null;
  try {
    lastRunAt = db.prepare(
      'SELECT started_at FROM runs WHERE team_id = ? ORDER BY started_at DESC LIMIT 1',
    ).get(tid)?.started_at ?? null;
  } catch (_) {}
  return {
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      created_at: team.created_at,
      is_personal: isPersonalTeamSlug(team.slug),
    },
    my_role: myRole,
    member_count: memberCount,
    counts: { cases, plans, environments },
    last_run_at: lastRunAt,
  };
}

export function transferOwnership(teamId, fromUserId, toUserId) {
  const tid = Number(teamId);
  const from = Number(fromUserId);
  const to = Number(toUserId);
  const team = getTeam(tid);
  if (!team) throw new Error('团队不存在');
  if (getMemberRole(tid, from) !== 'owner') throw new Error('仅所有者可转让');
  if (to === from) throw new Error('不能转让给自己');
  if (!getMemberRole(tid, to)) throw new Error('目标用户不是团队成员');
  const tx = db.transaction(() => {
    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run('owner', tid, to);
    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run('admin', tid, from);
  });
  tx();
}

export function leaveTeam(teamId, userId) {
  const tid = Number(teamId);
  const uid = Number(userId);
  const role = getMemberRole(tid, uid);
  if (!role) throw new Error('您不是该团队成员');
  if (role === 'owner') {
    const owners = db.prepare(
      "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role = 'owner'",
    ).get(tid).n;
    if (owners <= 1) throw new Error('您是唯一所有者，请先转让所有权或删除空间');
  }
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(tid, uid);
  const remaining = listUserTeams(uid);
  const next = remaining[0]?.id ?? null;
  return { nextTeamId: next };
}

export function deleteTeam(teamId, userId, { confirmName } = {}) {
  const tid = Number(teamId);
  const uid = Number(userId);
  const team = getTeam(tid);
  if (!team) throw new Error('团队不存在');
  if (getMemberRole(tid, uid) !== 'owner') throw new Error('仅所有者可删除空间');
  const name = String(confirmName || '').trim();
  if (name !== team.name) throw new Error('请输入正确的空间名称以确认删除');
  const caseN = db.prepare('SELECT COUNT(*) AS n FROM cases WHERE team_id = ?').get(tid)?.n ?? 0;
  let planN = 0;
  try {
    planN = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE team_id = ?').get(tid)?.n ?? 0;
  } catch (_) {}
  if (caseN > 0 || planN > 0) {
    throw new Error(`空间中仍有 ${caseN} 条用例、${planN} 个计划，请先清理后再删除`);
  }
  db.prepare('DELETE FROM teams WHERE id = ?').run(tid);
}
