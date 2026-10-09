/**
 * WPS 账号站 Web 登录（HTTP）：换 Cookie，供执行器写入仓库根 auth.json（Playwright storageState）。
 * 使用 Playwright 的 request 上下文管理 Cookie，无需安装浏览器。
 */
import crypto from 'crypto';
import { request } from 'playwright';

const ACCOUNT_ORIGIN = 'https://account.wps.cn';

const BROWSER_LIKE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

const SAME_SITE_HEADERS = {
  Origin: ACCOUNT_ORIGIN,
  Referer: `${ACCOUNT_ORIGIN}/`,
};

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}

function encryptPasswordRsaBase64(passKeyB64, plainPassword) {
  const der = Buffer.from(passKeyB64, 'base64');
  const publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(plainPassword, 'utf8'),
  );
  return encrypted.toString('base64');
}

function readUserId(item) {
  const v = item.userId ?? item.userid ?? item.user_id;
  return v != null ? Number(v) : undefined;
}

function pickUserIdByCompanyName(users, companyName) {
  const q = String(companyName || '').trim();
  if (!q) throw new Error('companyName 不能为空');

  let hit = users.find((x) => (x.company_name || '').trim() === q);
  if (hit != null) {
    const id = readUserId(hit);
    if (id != null) return id;
  }

  hit = users.find((x) => {
    const name = (x.company_name || '').trim();
    return name.includes(q) || q.includes(name);
  });
  if (hit != null) {
    const id = readUserId(hit);
    if (id != null) return id;
  }

  const names = [...new Set(users.map((x) => x.company_name).filter(Boolean))];
  throw new Error(`未找到公司「${q}」，可选：${names.join(' | ')}`);
}

/** 执行环境登录凭据：仅需手机号 + 企业名（密码不落库、不参与换 sid）。 */
export function resolveWpsLoginCredentials(execEnvRow, spawnEnvExtra = {}) {
  const env = { ...process.env, ...spawnEnvExtra };
  const phone =
    (execEnvRow?.test_username && String(execEnvRow.test_username).trim()) ||
    (env.E2E_USERNAME && String(env.E2E_USERNAME).trim()) ||
    '';
  const company =
    (execEnvRow?.wps_company_name && String(execEnvRow.wps_company_name).trim()) ||
    (env.WPS_COMPANY_NAME && String(env.WPS_COMPANY_NAME).trim()) ||
    '';
  return { phone, company };
}

export function authJsonFromWpsSid(wpsSid) {
  const value = String(wpsSid || '').trim();
  if (!value) return null;
  const expires = Math.floor(Date.now() / 1000) + 86400 * 365;
  const base = {
    name: 'wps_sid',
    value,
    path: '/',
    expires,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  };
  return {
    cookies: [
      { ...base, domain: '.kdocs.cn' },
      { ...base, domain: '.wps.cn' },
    ],
    origins: [],
  };
}

/**
 * @param {{ phone: string, password: string, companyName: string }} params
 * @returns {Promise<{ cookies: import('playwright').Cookie[] }>}
 */
export async function loginWpsAccountViaApi(params) {
  if (!params.password) {
    throw new Error('WPS 账号站登录缺少服务端自动化密码配置');
  }
  const api = await request.newContext({
    baseURL: ACCOUNT_ORIGIN,
    extraHTTPHeaders: { ...BROWSER_LIKE_HEADERS },
  });

  try {
    const warmup = await api.get('/', { headers: { ...SAME_SITE_HEADERS } });
    assertOk(warmup.ok(), `GET / 失败: ${warmup.status()}`);

    const passRes = await api.get(
      `/api/v3/passkey?account=${encodeURIComponent(params.phone)}`,
      { headers: { ...SAME_SITE_HEADERS } },
    );
    const passJson = await passRes.json();
    assertOk(passRes.ok(), `passkey 失败: ${passRes.status()}`);
    const passKey = passJson.pass_key ?? passJson.auth_key;
    assertOk(passJson.result === 'ok' && passKey && passJson.ssid, 'passkey 响应异常');

    const loginFrom = process.env.WPS_ACCOUNT_LOGIN_FROM?.trim() || 'weblogin_v3';
    const captchaType = process.env.WPS_SAFE_VERIFY_CAPTCHA_TYPE?.trim() || 'mock';

    const verifyRes = await api.post('/api/v3/account/safe_verify', {
      headers: { ...SAME_SITE_HEADERS },
      form: {
        ssid: passJson.ssid,
        password: encryptPasswordRsaBase64(passKey, params.password),
        account: params.phone,
        from: loginFrom,
        source: 'web',
        keeponline: '1',
        captcha_type: captchaType,
      },
    });
    const verifyJson = await verifyRes.json();
    assertOk(verifyRes.ok(), `safe_verify 失败: ${verifyRes.status()}`);
    assertOk(verifyJson.result === 'ok' && verifyJson.ssid, 'safe_verify 响应异常');

    const usersRes = await api.get(`/api/v3/login/users?ssid=${encodeURIComponent(verifyJson.ssid)}`, {
      headers: { ...SAME_SITE_HEADERS },
    });
    const usersJson = await usersRes.json();
    assertOk(usersRes.ok(), `login/users 失败: ${usersRes.status()}`);
    assertOk(usersJson.result === 'ok', 'login/users 响应异常');
    const userId = pickUserIdByCompanyName(usersJson.users ?? [], params.companyName);

    const loginRes = await api.post('/passport/secure/api/login', {
      headers: {
        ...SAME_SITE_HEADERS,
        'Content-Type': 'application/json',
      },
      data: {
        ssid: verifyJson.ssid,
        user_ids: [userId],
        slv: 'none',
      },
    });
    assertOk(loginRes.ok(), `passport login 失败: ${loginRes.status()}`);

    const state = await api.storageState();
    const wpsSid = state.cookies.find((c) => c.name === 'wps_sid')?.value || '';
    if (!wpsSid) throw new Error('未获取到 wps_sid');

    return { cookies: state.cookies };
  } finally {
    await api.dispose();
  }
}
