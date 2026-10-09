#!/usr/bin/env node
/**
 * 分步调试：手机号+企业名 → UIAUTO_COOKIE_LOGIN_URL → wps_sid → 首页探测
 */
import '../src/loadEnv.js';
import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { db } from '../src/db/schema.js';
import { resolveWpsLoginCredentials, authJsonFromWpsSid } from '../src/services/wpsAccountLogin.js';
import { hostsTextToChromiumHostResolverRules } from '../src/services/switchhosts.js';
import { WORKSPACE_ROOT } from '../src/services/caseWorkspace.js';

const envId = Number(process.env.DEBUG_ENV_ID || process.argv[2] || 2);
const HOME = 'https://365.kdocs.cn/aidocs/home/';

function step(n, msg) {
  console.log(`\n--- Step ${n}: ${msg} ---`);
}

const row = db.prepare('SELECT * FROM execution_environments WHERE id = ?').get(envId);
if (!row) {
  console.error(`环境 #${envId} 不存在`);
  process.exit(1);
}

const { phone, company } = resolveWpsLoginCredentials(row, {
  E2E_USERNAME: row.test_username,
  WPS_COMPANY_NAME: row.wps_company_name,
});
const loginUrl = process.env.UIAUTO_COOKIE_LOGIN_URL?.trim() || '';
const hasSwitch = !!(row.switchhosts_text && String(row.switchhosts_text).trim());

step(1, `环境 #${row.id}「${row.name}」`);
console.log({
  phone: phone ? `${phone.slice(0, 3)}****${phone.slice(-2)}` : '(空)',
  wps_company_name: company || '(空)',
  UIAUTO_COOKIE_LOGIN_URL: loginUrl ? '已配置' : '未配置',
  server_login_secret: !!(process.env.UIAUTO_INTERNAL_LOGIN_PASSWORD || process.env.E2E_PASSWORD),
});

if (!phone || !company) {
  console.error('失败: 请配置手机号与企业名');
  process.exit(1);
}

let storageState = null;
if (loginUrl) {
  step(2, 'POST UIAUTO_COOKIE_LOGIN_URL（手机号+企业名）');
  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username: phone,
      phone,
      company_name: company,
      wps_company_name: company,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('HTTP', res.status, data);
    process.exit(1);
  }
  const sid = data?.wps_sid ?? data?.wpsSid ?? data?.data?.wps_sid;
  storageState = sid ? authJsonFromWpsSid(sid) : null;
  if (!storageState && Array.isArray(data?.cookies)) {
    storageState = { cookies: data.cookies, origins: [] };
  }
} else {
  step(2, 'WPS 账号 API（手机号+企业名，密码在服务端）');
  const { loginWpsAccountViaApi } = await import('../src/services/wpsAccountLogin.js');
  const pwd =
    process.env.UIAUTO_INTERNAL_LOGIN_PASSWORD?.trim() || process.env.E2E_PASSWORD?.trim() || '';
  if (!pwd) {
    console.error('失败: 配置 UIAUTO_COOKIE_LOGIN_URL 或 UIAUTO_INTERNAL_LOGIN_PASSWORD');
    process.exit(1);
  }
  const { cookies } = await loginWpsAccountViaApi({ phone, password: pwd, companyName: company });
  storageState = { cookies, origins: [] };
}
if (!storageState?.cookies?.length) {
  console.error('未获得 wps_sid');
  process.exit(1);
}
console.log('wps_sid:', storageState.cookies.find((c) => c.name === 'wps_sid')?.value?.slice(0, 8) + '…');

step(3, '写入 auth.json');
const authPath = path.join(WORKSPACE_ROOT, 'auth.json');
await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
await fs.writeFile(authPath, JSON.stringify(storageState, null, 2), 'utf8');

const rules = row.env_kind === 'test' && hasSwitch
  ? hostsTextToChromiumHostResolverRules(String(row.switchhosts_text))
  : '';

step(4, '首页探测「新建应用」');
const launchOptions = { headless: true };
if (rules) launchOptions.args = [`--host-resolver-rules=${rules}`];
const browser = await chromium.launch(launchOptions);
let page;
try {
  const context = await browser.newContext({ storageState: authPath, locale: 'zh-CN' });
  page = await context.newPage();
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('text=新建应用', { timeout: 60000 });
  console.log('结果: 登录成功');
} catch (e) {
  console.error('结果: 失败', e?.message || e);
  if (page) await page.screenshot({ path: path.join(WORKSPACE_ROOT, 'debug-login-fail.png') }).catch(() => {});
  process.exit(2);
} finally {
  await browser.close();
}
console.log('\n全部步骤通过。');
