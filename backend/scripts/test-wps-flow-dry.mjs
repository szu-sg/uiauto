#!/usr/bin/env node
/** 验证账号站链路可达：passkey + safe_verify(mock)，不打印密码 */
import { request } from 'playwright';
import crypto from 'crypto';

const phone = process.argv[2] || '18038147672';
const company = process.argv[3] || '金山办公';
const password = process.env.WPS_TEST_LOGIN_PASSWORD || '';

const ACCOUNT = 'https://account.wps.cn';
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: ACCOUNT,
  Referer: `${ACCOUNT}/`,
};

function encrypt(passKeyB64, plain) {
  const der = Buffer.from(passKeyB64, 'base64');
  const publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  return crypto
    .publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plain, 'utf8'))
    .toString('base64');
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const api = await request.newContext({ baseURL: ACCOUNT, extraHTTPHeaders: headers, ignoreHTTPSErrors: true });

try {
  const passRes = await api.get(`/api/v3/passkey?account=${encodeURIComponent(phone)}`, { headers });
  const passJson = await passRes.json();
  console.log('1 passkey:', passRes.status(), passJson.result, 'ssid:', !!passJson.ssid);

  if (!password) {
    console.log('2 safe_verify: SKIP (set WPS_TEST_LOGIN_PASSWORD to test full chain)');
    console.log('3 company:', company, '(needs verify ssid + login/users after step 2)');
    process.exit(0);
  }

  const passKey = passJson.pass_key ?? passJson.auth_key;
  const verifyRes = await api.post('/api/v3/account/safe_verify', {
    headers,
    form: {
      ssid: passJson.ssid,
      password: encrypt(passKey, password),
      account: phone,
      from: 'weblogin_v3',
      source: 'web',
      keeponline: '1',
      captcha_type: 'mock',
    },
  });
  const verifyJson = await verifyRes.json();
  console.log('2 safe_verify(mock):', verifyRes.status(), verifyJson.result, verifyJson.msg || '');

  if (verifyJson.result !== 'ok' || !verifyJson.ssid) process.exit(1);

  const usersRes = await api.get(`/api/v3/login/users?ssid=${encodeURIComponent(verifyJson.ssid)}`, { headers });
  const usersJson = await usersRes.json();
  const names = (usersJson.users || []).map((u) => u.company_name).filter(Boolean);
  const hit = (usersJson.users || []).find((u) => String(u.company_name || '').includes(company));
  console.log('3 login/users:', usersRes.status(), usersJson.result, 'companies:', names.slice(0, 5).join(' | '));
  console.log('4 company match:', hit ? `userId=${hit.userId ?? hit.userid}` : 'NOT FOUND');

  const { loginWpsAccountViaApi } = await import('../src/services/wpsAccountLogin.js');
  const { cookies } = await loginWpsAccountViaApi({ phone, password, companyName: company });
  const sid = cookies.find((c) => c.name === 'wps_sid')?.value;
  console.log('5 wps_sid:', sid ? `${sid.slice(0, 10)}…` : 'MISSING');
  process.exit(sid ? 0 : 1);
} finally {
  await api.dispose();
}
