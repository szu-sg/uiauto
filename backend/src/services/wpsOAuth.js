/**
 * WPS OAuth2（与 CSR 质量评测 auth.py 一致）
 * access_token 仅在后端使用，不返回前端。
 */
const OAUTH_BASE = 'https://portal.kwps.cn/api/access/wpsopen/oauth2';
const APPID = process.env.WPS_APPID || '854bb91c-5ef2-11f1-adfe-dee35356ca96';
const APPKEY = process.env.WPS_APPKEY || 'ckz7yJd0v5482wKteXqNVh6UQ93ZOmW1';
/** 须与 WPS 开放平台登记一致；本地 Vite 默认 http://localhost:5180/ */
const REDIRECT_URI = process.env.WPS_REDIRECT_URI || 'http://localhost:5180/';

export function getRedirectUri() {
  return REDIRECT_URI;
}

export function getAuthorizeUrl(state = '') {
  const params = new URLSearchParams({
    response_type: 'code',
    appid: APPID,
    redirect_uri: REDIRECT_URI,
    scope: 'user_info',
  });
  if (state) params.set('state', state);
  return `${OAUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * @param {string} code
 * @returns {Promise<{ uid: string, wps_uid: number|null, nickname: string, avatar: string, email: string, company_uid: string }>}
 */
export async function exchangeCodeForUser(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) {
    const err = new Error('code 不能为空');
    err.status = 400;
    throw err;
  }

  let tokenResp;
  try {
    tokenResp = await fetch(`${OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appid: APPID, appkey: APPKEY, code: trimmed }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const err = new Error(`Token 请求网络错误: ${e.message}`);
    err.status = 502;
    throw err;
  }

  if (!tokenResp.ok) {
    const err = new Error(`Token 接口返回 HTTP ${tokenResp.status}`);
    err.status = 502;
    throw err;
  }

  const tokenBody = await tokenResp.json();
  if (tokenBody.result !== 0) {
    const msg = tokenBody.message || tokenBody.msg || '未知错误';
    const err = new Error(`Token 换取失败: ${msg}`);
    err.status = 401;
    throw err;
  }

  const accessToken = tokenBody.token?.access_token;
  if (!accessToken) {
    const err = new Error('响应中缺少 access_token');
    err.status = 502;
    throw err;
  }

  let userResp;
  try {
    const qs = new URLSearchParams({ access_token: accessToken, appid: APPID });
    userResp = await fetch(`${OAUTH_BASE}/user?${qs}`, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    const err = new Error(`用户信息请求网络错误: ${e.message}`);
    err.status = 502;
    throw err;
  }

  if (!userResp.ok) {
    const err = new Error(`用户信息接口返回 HTTP ${userResp.status}`);
    err.status = 502;
    throw err;
  }

  const userBody = await userResp.json();
  if (userBody.result !== 0) {
    const msg = userBody.message || userBody.msg || '未知错误';
    const err = new Error(`用户信息获取失败: ${msg}`);
    err.status = 401;
    throw err;
  }

  const u = userBody.user || {};
  const uid = String(u.uid || '');
  const wpsUid = u.wps_uid != null ? Number(u.wps_uid) : null;
  const nickname = String(u.nickname || '');
  const avatar = String(u.avatar || '');
  const email = String(u.email || '').trim().toLowerCase();
  const companyUid = String(u.company_uid || '');

  console.log(
    `[OAuth] login success uid=${uid} wps_uid=${wpsUid} nickname=${nickname} email=${email} company_uid=${companyUid}`
  );

  return {
    uid,
    wps_uid: Number.isFinite(wpsUid) ? wpsUid : null,
    nickname,
    avatar,
    email,
    company_uid: companyUid,
  };
}
