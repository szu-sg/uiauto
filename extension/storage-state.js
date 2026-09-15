/** Chrome Cookie / storageState → Playwright storageState 格式 */

/** 仅同步登录核心 Cookie（如 wps_sid），不同步整站 Cookie */
export const ESSENTIAL_COOKIE_NAMES = ['wps_sid', 'wps_sids'];

const ESSENTIAL_SET = new Set(ESSENTIAL_COOKIE_NAMES.map((n) => n.toLowerCase()));

export function isEssentialCookieName(name) {
  return ESSENTIAL_SET.has(String(name || '').toLowerCase());
}

export function filterEssentialStorageState(state) {
  if (!state || typeof state !== 'object') {
    return { cookies: [], origins: [] };
  }
  const cookies = (Array.isArray(state.cookies) ? state.cookies : [])
    .filter((c) => c?.name && isEssentialCookieName(c.name));
  return { cookies, origins: [] };
}

export function chromeCookieToPlaywright(cookie) {
  const raw = String(cookie?.sameSite || 'unspecified').toLowerCase();
  const sameSiteMap = {
    no_restriction: 'None',
    lax: 'Lax',
    strict: 'Strict',
    unspecified: 'Lax',
    none: 'None',
  };
  let sameSite = sameSiteMap[raw] || 'Lax';
  if (sameSite === 'None' && !cookie.secure) sameSite = 'Lax';

  let expires = -1;
  if (cookie.expirationDate && cookie.expirationDate > 0) {
    expires = Math.floor(cookie.expirationDate);
  }

  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || '',
    path: cookie.path || '/',
    expires,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite,
  };
}

export function normalizeStorageStateForPlaywright(state) {
  if (!state || typeof state !== 'object') {
    return { cookies: [], origins: [] };
  }
  const cookies = (Array.isArray(state.cookies) ? state.cookies : [])
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      if (c.expirationDate != null && c.expires == null) return chromeCookieToPlaywright(c);
      if (c.expires != null && c.name && c.domain) return c;
      return chromeCookieToPlaywright(c);
    })
    .filter(Boolean);
  const origins = Array.isArray(state.origins) ? state.origins : [];
  return { cookies, origins };
}

function toCookieScopeUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return pageUrl;
  }
}

function getCookiesByUrlAndName(url, name) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ url, name }, (cookies) => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(cookies || []);
    });
  });
}

function getCookiesByName(name) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ name }, (cookies) => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(cookies || []);
    });
  });
}

export async function buildStorageStateFromUrl(pageUrl) {
  const page = String(pageUrl || '').trim();
  if (!page) return null;

  const merged = new Map();
  const add = (list) => {
    (list || []).forEach((c) => {
      if (!c?.name || !isEssentialCookieName(c.name)) return;
      merged.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    });
  };

  const scopeUrl = toCookieScopeUrl(page);
  for (const name of ESSENTIAL_COOKIE_NAMES) {
    add(await getCookiesByUrlAndName(scopeUrl, name));
    add(await getCookiesByName(name));
  }

  if (/kdocs\.cn|wps\.cn|qq\.com/i.test(page)) {
    for (const scope of [
      'https://365.kdocs.cn/',
      'https://kdocs.cn/',
      'https://www.kdocs.cn/',
      'https://wps.cn/',
      'https://docs.qq.com/',
      'https://qq.com/',
    ]) {
      for (const name of ESSENTIAL_COOKIE_NAMES) {
        add(await getCookiesByUrlAndName(scope, name));
      }
    }
  }

  const chromeCookies = Array.from(merged.values());
  if (!chromeCookies.length) return null;

  return filterEssentialStorageState(
    normalizeStorageStateForPlaywright({
      cookies: chromeCookies.map(chromeCookieToPlaywright),
      origins: [],
    }),
  );
}

export async function buildStorageStateFromTab(tabId, pageUrl) {
  return buildStorageStateFromUrl(pageUrl);
}
