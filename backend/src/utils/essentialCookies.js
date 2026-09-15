/** 录制/试跑仅保留登录态核心 Cookie，避免同步与存储整站 Cookie */
export const ESSENTIAL_COOKIE_NAMES = ['wps_sid', 'wps_sids'];

const ESSENTIAL_SET = new Set(ESSENTIAL_COOKIE_NAMES.map((n) => n.toLowerCase()));

export function isEssentialCookieName(name) {
  return ESSENTIAL_SET.has(String(name || '').toLowerCase());
}

export function filterEssentialStorageState(storageState) {
  if (!storageState || typeof storageState !== 'object') return null;
  const cookies = (Array.isArray(storageState.cookies) ? storageState.cookies : [])
    .filter((c) => c?.name && isEssentialCookieName(c.name));
  if (!cookies.length) return null;
  return { cookies, origins: [] };
}

/** Playwright cookie.expires 为 Unix 秒；会话 Cookie 无 expires 或 -1 视为有效 */
export function isEssentialCookieUsable(cookie) {
  if (!cookie?.name || !isEssentialCookieName(cookie.name)) return false;
  const val = cookie.value != null ? String(cookie.value) : '';
  if (!val.trim()) return false;
  const exp = cookie.expires;
  if (exp == null || exp === '' || Number(exp) <= 0) return true;
  const expSec = Number(exp);
  if (!Number.isFinite(expSec)) return true;
  return expSec * 1000 > Date.now();
}

/** 是否可用用例录制上下文登录（否则执行时应走计划环境账号） */
export function storageStateUsableForLogin(storageState) {
  const filtered = filterEssentialStorageState(storageState);
  if (!filtered?.cookies?.length) return false;
  return filtered.cookies.some(isEssentialCookieUsable);
}
