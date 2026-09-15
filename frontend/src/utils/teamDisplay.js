export const TEAM_ROLE_LABELS = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读',
};

const ADMIN_ROLES = new Set(['owner', 'admin']);

export function teamRoleLabel(role) {
  return TEAM_ROLE_LABELS[role] || role || '—';
}

export function canManageTeamMembers(role) {
  return ADMIN_ROLES.has(role);
}

/** 成员及以上可邀请（邮箱待加入） */
export function canInviteTeamMembers(role) {
  if (!role) return false;
  const rank = { viewer: 0, member: 1, admin: 2, owner: 3 }[role] ?? -1;
  return rank >= 1;
}

/** 当前空间角色：优先 /auth/me 的 current_team_role */
export function currentTeamRole(user) {
  if (!user) return null;
  if (user.current_team_role) return user.current_team_role;
  const tid = user.current_team_id;
  const team = (user.teams || []).find((t) => t.id === tid);
  return team?.role || null;
}

/** member / admin / owner 可在空间内创建、修改、执行 */
export function canWriteTeamResources(user) {
  const role = currentTeamRole(user);
  return role === 'owner' || role === 'admin' || role === 'member';
}

/** 空间内任意成员（含只读）可新建自己的执行环境 */
export function canCreateExecutionEnvironment(user) {
  return Boolean(currentTeamRole(user));
}

/** @param {string | null | undefined} slug */
export function isPersonalTeam(slug) {
  if (!slug) return false;
  return String(slug).startsWith('personal-');
}

/** 界面展示用空间标识（不展示 personal-*） */
export function formatTeamSlug(slug, teamId) {
  if (slug && !isPersonalTeam(slug)) return slug;
  if (teamId != null && teamId !== '') return `space-${teamId}`;
  if (slug && isPersonalTeam(slug)) {
    const id = String(slug).replace(/^personal-/, '');
    return id ? `space-${id}` : slug;
  }
  return slug || '—';
}

export function teamTypeLabel(_slug) {
  return '项目空间';
}

export function isPlatformSuperAdmin(user) {
  const u = user;
  if (u && typeof u === 'object' && 'role' in u) {
    return u.role === 'super_admin';
  }
  return false;
}

/** 行内改角色可选值（不含 owner，转让见 B08） */
export const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'];
