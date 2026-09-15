import { db } from '../db/schema.js';

function teamIsActive(teamId) {
  const row = db.prepare('SELECT status FROM teams WHERE id = ?').get(Number(teamId));
  if (!row) return false;
  return (row.status || 'active') !== 'closed';
}

function isMember(teamId, userId) {
  return !!db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(
    Number(teamId),
    Number(userId),
  );
}

export function listTeamInvites(teamId) {
  return db.prepare(`
    SELECT i.id, i.team_id, i.email, i.real_name, i.role, i.created_at,
      u.real_name AS invited_by_name, u.email AS invited_by_email
    FROM team_invites i
    LEFT JOIN users u ON u.id = i.invited_by
    WHERE i.team_id = ?
    ORDER BY i.created_at DESC
  `).all(Number(teamId));
}

export function createTeamInvite(teamId, inviterId, { email, real_name, role = 'member' }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !mail.includes('@')) throw new Error('邮箱格式无效');
  const tid = Number(teamId);
  const r = String(role || 'member').toLowerCase();
  if (!['admin', 'member', 'viewer'].includes(r)) throw new Error('无效角色');
  const existingUser = db.prepare(
    'SELECT id FROM users WHERE email = ? OR username = ?',
  ).get(mail, mail);
  if (existingUser && isMember(tid, existingUser.id)) {
    throw new Error('该用户已是团队成员');
  }
  const dup = db.prepare('SELECT id FROM team_invites WHERE team_id = ? AND email = ?').get(tid, mail);
  if (dup) throw new Error('该邮箱已在待加入列表中');
  const name = String(real_name || '').trim() || null;
  const ins = db.prepare(`
    INSERT INTO team_invites (team_id, email, real_name, role, invited_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(tid, mail, name, r, Number(inviterId));
  return db.prepare('SELECT * FROM team_invites WHERE id = ?').get(ins.lastInsertRowid);
}

export function removeTeamInvite(teamId, inviteId) {
  const row = db.prepare('SELECT id FROM team_invites WHERE id = ? AND team_id = ?').get(
    Number(inviteId),
    Number(teamId),
  );
  if (!row) throw new Error('邀请不存在');
  db.prepare('DELETE FROM team_invites WHERE id = ?').run(row.id);
}

/** 用户登录后按邮箱兑现待加入邀请 */
export function applyPendingInvitesForUser(userId, email) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return [];
  const invites = db.prepare('SELECT * FROM team_invites WHERE email = ?').all(mail);
  const joinedTeamIds = [];
  for (const inv of invites) {
    if (!teamIsActive(inv.team_id)) {
      db.prepare('DELETE FROM team_invites WHERE id = ?').run(inv.id);
      continue;
    }
    if (!isMember(inv.team_id, userId)) {
      db.prepare(
        'INSERT OR IGNORE INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
      ).run(inv.team_id, userId, inv.role || 'member', inv.invited_by);
      joinedTeamIds.push(inv.team_id);
    }
    db.prepare('DELETE FROM team_invites WHERE id = ?').run(inv.id);
  }
  return joinedTeamIds;
}
