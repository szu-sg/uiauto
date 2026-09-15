/** SSO 用户展示字段归一化（与 /api/auth/me 一致） */

export function displayName(user) {
  if (!user) return '—';
  const name = String(user.real_name || '').trim();
  if (name) return name;
  const email = String(user.email || user.username || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return email || '—';
}

export function displayEmail(user) {
  if (!user) return '';
  const email = String(user.email || '').trim();
  if (email) return email;
  const u = String(user.username || '').trim();
  return u.includes('@') ? u : '';
}

export function displaySubtitle(user) {
  if (!user) return '';
  const parts = [];
  const email = displayEmail(user);
  if (email) parts.push(email);
  if (user.uid != null && String(user.uid).trim()) parts.push(`UID ${String(user.uid).trim()}`);
  if (user.role_label && user.role !== 'member') parts.push(user.role_label);
  return parts.join(' · ');
}

export function userInitials(user) {
  const name = displayName(user);
  if (!name || name === '—') return '?';
  if (/[\u4e00-\u9fff]/.test(name)) return name.slice(0, 1);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** 写入计划的创建人字段 */
export function creatorNameFromUser(user) {
  const name = displayName(user);
  return name === '—' ? '' : name;
}

/** 运行记录 API 附带的触发人字段 → 用户对象 */
export function userFromTriggerFields(row) {
  if (!row) return null;
  const name = row.trigger_user_name;
  const email = row.trigger_user_email;
  const avatar = row.trigger_user_avatar;
  const uid = row.trigger_user_uid;
  if (!name && !email && !avatar && !uid) return null;
  return {
    real_name: name || null,
    email: email || null,
    avatar: avatar || null,
    uid: uid || null,
  };
}

/** 列表里仅有 creator 字符串时的展示 */
export function displayCreatorText(text, currentUser) {
  const t = String(text || '').trim();
  if (!t) return currentUser ? displayName(currentUser) : '—';
  return t;
}

export function isSameCreator(text, user) {
  if (!text || !user) return false;
  const t = String(text).trim();
  if (!t) return false;
  return t === displayName(user) || t === displayEmail(user) || t === String(user.username || '').trim();
}
