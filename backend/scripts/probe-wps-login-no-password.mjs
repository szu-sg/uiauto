#!/usr/bin/env node
/**
 * 探测：仅手机号 + 企业名能否换 wps_sid（不调密码 safe_verify）
 */
import '../src/loadEnv.js';
import { request } from 'playwright';
import { loginWpsAccountViaApi } from '../src/services/wpsAccountLogin.js';

let phone;
let company;
if (process.argv[3]) {
  phone = String(process.argv[2]).trim();
  company = String(process.argv[3]).trim();
} else {
  const { db } = await import('../src/db/schema.js');
  const { resolveWpsLoginCredentials } = await import('../src/services/wpsAccountLogin.js');
  const envId = Number(process.argv[2] || 2);
  const row = db.prepare('SELECT * FROM execution_environments WHERE id = ?').get(envId);
  if (!row) {
    console.error('usage: node probe-wps-login-no-password.mjs <envId>  OR  <phone> <company>');
    process.exit(1);
  }
  ({ phone, company } = resolveWpsLoginCredentials(row, {}));
}
console.log('phone:', phone ? `${phone.slice(0, 3)}****${phone.slice(-2)}` : '(empty)');
console.log('company:', company || '(empty)');

const loginUrl = process.env.UIAUTO_COOKIE_LOGIN_URL?.trim();
if (loginUrl) {
  console.log('\n--- POST UIAUTO_COOKIE_LOGIN_URL ---');
  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: phone, phone, company_name: company, wps_company_name: company }),
  });
  const text = await res.text();
  console.log('status:', res.status);
  console.log('body:', text.slice(0, 500));
}

console.log('\n--- loginWpsAccountViaApi without password ---');
try {
  await loginWpsAccountViaApi({ phone, password: '', companyName: company });
} catch (e) {
  console.log('error:', e.message);
}

const ACCOUNT = 'https://account.wps.cn';
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: ACCOUNT,
  Referer: `${ACCOUNT}/`,
};

// 部分环境抓包/代理会导致 Node 校验证书失败，探测时允许跳过（仅本脚本）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const api = await request.newContext({ baseURL: ACCOUNT, extraHTTPHeaders: headers, ignoreHTTPSErrors: true });
try {
  await api.get('/');
  const passRes = await api.get(`/api/v3/passkey?account=${encodeURIComponent(phone)}`);
  const passJson = await passRes.json();
  console.log('\n--- passkey?account=phone ---');
  console.log('ok:', passRes.ok(), 'result:', passJson.result, 'has ssid:', !!passJson.ssid);

  const passResNoAcct = await api.get('/api/v3/passkey');
  const passJsonNoAcct = await passResNoAcct.json();
  console.log('\n--- passkey (no account) ---');
  console.log('ok:', passResNoAcct.ok(), 'result:', passJsonNoAcct.result);

  // 常见「仅账号」探测（无密码）
  const probes = [
    ['GET login/users (no ssid)', () => api.get('/api/v3/login/users')],
    [
      'POST safe_verify empty password',
      () =>
        api.post('/api/v3/account/safe_verify', {
          form: {
            ssid: passJson.ssid,
            password: '',
            account: phone,
            from: 'weblogin_v2',
            source: 'web',
            keeponline: '1',
            captcha_type: 'mock',
          },
        }),
    ],
    [
      'POST safe_verify no password field',
      () =>
        api.post('/api/v3/account/safe_verify', {
          form: {
            ssid: passJson.ssid,
            account: phone,
            from: 'weblogin_v2',
            source: 'web',
            keeponline: '1',
            captcha_type: 'mock',
          },
        }),
    ],
    [
      'POST login by company (guess)',
      () =>
        api.post('/api/v3/login', {
          headers: { 'Content-Type': 'application/json' },
          data: { account: phone, company_name: company },
        }),
    ],
    [
      'POST passport login company (guess)',
      () =>
        api.post('/passport/secure/api/login', {
          headers: { 'Content-Type': 'application/json' },
          data: { account: phone, company_name: company },
        }),
    ],
    [
      'POST sms send (guess)',
      () =>
        api.post('/api/v3/sms/verifycode', {
          form: { phone, ssid: passJson.ssid, action: 'login' },
        }),
    ],
    [
      'GET login users with passkey ssid only',
      () => api.get(`/api/v3/login/users?ssid=${encodeURIComponent(passJson.ssid)}`),
    ],
  ];

  for (const [label, fn] of probes) {
    try {
      const r = await fn();
      const body = await r.text();
      console.log(`\n--- ${label} ---`);
      console.log('status:', r.status());
      console.log('body:', body.slice(0, 400));
    } catch (e) {
      console.log(`\n--- ${label} --- error:`, e.message);
    }
  }
} finally {
  await api.dispose();
}
