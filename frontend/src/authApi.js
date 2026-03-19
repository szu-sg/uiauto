const TOKEN_KEY = 'uiauto_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** 带登录态的 fetch；401 会清 token 并跳转登录页 */
export async function authFetch(url, opts = {}) {
  const headers = { ...opts.headers, ...authHeaders() };
  if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(url, { ...opts, headers });
  if (r.status === 401) {
    clearToken();
    const p = window.location.pathname || '';
    if (!p.startsWith('/login') && !p.startsWith('/register')) {
      window.location.href = '/login';
    }
  }
  return r;
}
