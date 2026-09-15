import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { parse as dotenvParse } from 'dotenv';
import PQueue from 'p-queue';
import { notifyRunFinished, mentionIdsForRun } from './collaborationNotify.js';
import { hostsTextToChromiumHostResolverRules } from './switchhosts.js';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';
import {
  parseCaseMetadataObject,
  resolveCaseSource,
  repoWorkspaceKey,
  recordedCasesRoot,
  syncRecordedCaseForRun,
} from './caseExecution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '../../repos');
const RESULTS_DIR = path.join(__dirname, '../../results');
/** 执行时注入到用例仓库的 .env / auth 来源：data/run.env、data/.env、backend/.env */
const DATA_DIR = path.resolve(__dirname, '../../data');
const RUN_ENV_PATH = path.join(DATA_DIR, 'run.env');
const DATA_ENV_PATH = path.join(DATA_DIR, '.env');
const BACKEND_ENV_PATH = path.join(DATA_DIR, '..', '.env');
const queue = new PQueue({ concurrency: 1 });

/** 多浏览器/用例并行数（同时运行的 Playwright 进程数），可通过环境变量 RUN_CONCURRENCY 覆盖 */
const RUN_CONCURRENCY = Math.max(1, parseInt(process.env.RUN_CONCURRENCY, 10) || 3);

const EXTRA_ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 与前端「环境类型」说明一致：测试需 SwitchHosts；灰度/私有化不需要；URL 习惯不同 */
function executionTraitsForKind(kind) {
  const k = kind === 'staging' || k === 'private' ? kind : 'test';
  if (k === 'test') {
    return {
      switchHosts: true,
      baseUrlTypical: 'https://365.kdocs.cn',
      baseUrlNote: '测试环境通常配合本机 SwitchHosts；基础 URL 多与 hosts 中 365 文档域一致',
    };
  }
  if (k === 'staging') {
    return {
      switchHosts: false,
      baseUrlTypical: 'https://365.kdocs.cn',
      baseUrlNote: '灰度无需 SwitchHosts；基础 URL 常见为文档域（如 365.kdocs.cn）',
    };
  }
  return {
    switchHosts: false,
    baseUrlTypical: 'http(s)://<ip>:<port>',
    baseUrlNote:
      '私有化无需 SwitchHosts；基础 URL 多为内网 IP + 端口；若入口映射为文档域也可使用 365.kdocs.cn 等形式',
  };
}

/**
 * 将计划绑定的执行环境写入克隆仓库根目录的 .uiauto-execution.json，并返回需合并进 Playwright 子进程的环境变量。
 * 用例可通过 process.env.UIAUTO_EXEC_CONFIG 读绝对路径加载完整 JSON；常用项同时注入 BASE_URL / E2E_*。
 */
async function prepareExecutionProfileForRepo(repoDir, row) {
  const configPath = path.join(repoDir, '.uiauto-execution.json');
  if (!row) {
    await fs.unlink(configPath).catch(() => {});
    return {};
  }
  let headers = [];
  try {
    const h = JSON.parse(row.headers_json || '[]');
    if (Array.isArray(h)) headers = h;
  } catch (_) {}
  let extraEnv = {};
  try {
    const ex = JSON.parse(row.extra_env_json || '{}');
    if (ex && typeof ex === 'object' && !Array.isArray(ex)) extraEnv = ex;
  } catch (_) {}
  const kind = row.env_kind || 'test';
  const traits = executionTraitsForKind(kind);
  let hostResolverRules = '';
  const rawSwitch = row.switchhosts_text != null ? String(row.switchhosts_text).trim() : '';
  if (kind === 'test' && rawSwitch) {
    hostResolverRules = hostsTextToChromiumHostResolverRules(rawSwitch);
    if (!hostResolverRules) {
      console.warn(
        '[Executor] 测试环境已填写 SwitchHosts 文本，但未解析出有效 IPv4 映射（需每行：IP 域名，# 可注释）'
      );
    }
  }
  const wpsCompany = row.wps_company_name != null ? String(row.wps_company_name).trim() : '';
  const payload = {
    kind,
    baseUrl: row.base_url || '',
    headers,
    username: row.test_username || '',
    password: row.test_password || '',
    wpsCompanyName: wpsCompany,
    extraEnv,
    traits,
    switchHostsRaw: kind === 'test' ? rawSwitch : '',
    hostResolverRules,
  };
  await fs.writeFile(configPath, JSON.stringify(payload), 'utf8');
  const out = {
    UIAUTO_EXEC_CONFIG: configPath,
    UIAUTO_ENV_KIND: payload.kind,
    UIAUTO_SWITCHHOSTS_EXPECTED: traits.switchHosts ? '1' : '0',
  };
  if (hostResolverRules) {
    out.UIAUTO_HOST_RESOLVER_RULES = hostResolverRules;
  }
  if (payload.baseUrl) out.BASE_URL = payload.baseUrl;
  if (payload.username) out.E2E_USERNAME = payload.username;
  if (payload.password) out.E2E_PASSWORD = payload.password;
  if (wpsCompany) out.WPS_COMPANY_NAME = wpsCompany;
  for (const [k, v] of Object.entries(extraEnv)) {
    if (!EXTRA_ENV_KEY_RE.test(k) || v == null) continue;
    out[k] = String(v);
  }
  return out;
}

/** 当前正在执行的任务，用于取消时 kill 子进程；children 在并行时会有多个 */
export const runningTask = { runId: null, child: null, children: new Set() };

/** 供 /api/status 查询当前是否在执行及 runId */
export function getRunningRunId() {
  return runningTask.runId ?? null;
}

/** 与 web_ui 仓库 save-auth.js 一致：用 Playwright 在仓库内 headless 生成 auth.json，保证格式与 config 完全兼容 */
const GEN_AUTH_SCRIPT = `
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const WPS_SID = process.env.WPS_SID && String(process.env.WPS_SID).trim();
if (!WPS_SID) process.exit(1);
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1980, height: 1080 } });
  await context.addCookies([
    { name: 'wps_sid', value: WPS_SID, domain: '.kdocs.cn', path: '/' },
    { name: 'wps_sid', value: WPS_SID, domain: '.wps.cn', path: '/' },
  ]);
  await context.storageState({ path: path.join(__dirname, 'auth.json') });
  await browser.close();
})().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
`;

/**
 * 从以下位置之一读取 WPS_SID，并生成 auth.json 到仓库根，供 playwright.config 的 storageState 使用。
 * 优先用仓库内 Playwright headless 生成（与 save-auth.js 同逻辑、格式一致）；失败则回退为手写 JSON。
 * 读取顺序：仓库根 .env（复制后）→ data/run.env → data/.env → backend/.env
 */
async function injectAuthFromEnv(repoDir) {
  const envPaths = [
    path.join(repoDir, '.env'),
    RUN_ENV_PATH,
    DATA_ENV_PATH,
    BACKEND_ENV_PATH,
  ];
  let content;
  for (const p of envPaths) {
    try {
      content = await fs.readFile(p, 'utf8');
      break;
    } catch (_) {
      continue;
    }
  }
  const parsed = content ? dotenvParse(content) : {};
  const wpsSid =
    (parsed.WPS_SID && String(parsed.WPS_SID).trim()) ||
    (process.env.WPS_SID && String(process.env.WPS_SID).trim());
  if (!wpsSid) return;

  const genAuthPath = path.join(repoDir, '.uiauto-gen-auth.cjs');
  const authPath = path.join(repoDir, 'auth.json');
  try {
    await fs.writeFile(genAuthPath, GEN_AUTH_SCRIPT.trim(), 'utf8');
    const { code } = await new Promise((resolve, reject) => {
      const child = spawn('node', ['.uiauto-gen-auth.cjs'], {
        cwd: repoDir,
        shell: false,
        stdio: 'pipe',
        env: { ...process.env, WPS_SID: wpsSid },
      });
      let err = '';
      child.stdout.on('data', () => {});
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (c) => resolve({ code: c, err }));
      child.on('error', reject);
    });
    await fs.unlink(genAuthPath).catch(() => {});
    if (code === 0) {
      console.log('[Executor] 已用仓库内 Playwright 生成 auth.json，登录态已注入');
      return;
    }
  } catch (_) {
    await fs.unlink(genAuthPath).catch(() => {});
  }

  const expires = Math.floor(Date.now() / 1000) + 86400 * 365;
  const storageState = {
    cookies: [
      { name: 'wps_sid', value: wpsSid, domain: '.kdocs.cn', path: '/', expires, httpOnly: false, secure: true, sameSite: 'Lax' },
      { name: 'wps_sid', value: wpsSid, domain: '.wps.cn', path: '/', expires, httpOnly: false, secure: true, sameSite: 'Lax' },
    ],
    origins: [],
  };
  await fs.writeFile(authPath, JSON.stringify(storageState, null, 2), 'utf8');
  console.log('[Executor] 已从 run.env/.env 手写 auth.json 注入登录态');
}

/** 录制时同步的 Playwright storageState → auth.json（试跑优先使用） */
async function injectRecordedStorageState(repoDir, storageState) {
  const filtered = filterEssentialStorageState(storageState);
  if (!filtered) return false;
  const cookies = filtered.cookies;
  const origins = filtered.origins;
  if (!cookies.length && !origins.length) return false;

  const normalized = {
    cookies: cookies.map(normalizePlaywrightCookie).filter(Boolean),
    origins,
  };
  if (!normalized.cookies.length && !normalized.origins.length) return false;

  const authPath = path.join(repoDir, 'auth.json');
  await fs.writeFile(authPath, JSON.stringify(normalized, null, 2), 'utf8');
  console.log(`[Executor] 已写入录制登录态 auth.json（${normalized.cookies.length} 条 Cookie）`);
  return true;
}

/**
 * 纯 HTTP：若合并后的环境变量中有 UIAUTO_COOKIE_LOGIN_URL，且 E2E_USERNAME / E2E_PASSWORD 非空，
 * 则 POST 该 URL，body 为 JSON { username, password }。期望响应为：
 * { "cookies": [ { "name","value","domain","path", ... } ] }（与 Playwright storageState.cookies 字段兼容），
 * 或根为 cookies 数组。可选 UIAUTO_COOKIE_LOGIN_HEADERS（JSON 对象字符串）附加请求头。
 * 成功则写入仓库根 auth.json；若本步成功会覆盖此前 WPS 等方式生成的 auth.json。
 */
async function injectAuthFromCookieApi(repoDir, spawnEnvExtra) {
  const env = { ...process.env, ...spawnEnvExtra };
  const url = env.UIAUTO_COOKIE_LOGIN_URL && String(env.UIAUTO_COOKIE_LOGIN_URL).trim();
  const username = env.E2E_USERNAME && String(env.E2E_USERNAME).trim();
  const password = env.E2E_PASSWORD && String(env.E2E_PASSWORD).trim();
  if (!url || !username || !password) return;

  const authPath = path.join(repoDir, 'auth.json');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const rawExtra = env.UIAUTO_COOKIE_LOGIN_HEADERS && String(env.UIAUTO_COOKIE_LOGIN_HEADERS).trim();
  if (rawExtra) {
    try {
      const parsed = JSON.parse(rawExtra);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(headers, parsed);
    } catch (_) {
      console.warn('[Executor] UIAUTO_COOKIE_LOGIN_HEADERS 不是合法 JSON，已忽略');
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[Executor] Cookie 登录接口 HTTP ${res.status}，未写入 auth.json`);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data) {
      console.warn('[Executor] Cookie 登录接口响应非 JSON，未写入 auth.json');
      return;
    }
    let cookies = [];
    if (Array.isArray(data)) cookies = data;
    else if (Array.isArray(data.cookies)) cookies = data.cookies;
    else if (data.data && Array.isArray(data.data.cookies)) cookies = data.data.cookies;
    if (!cookies.length) {
      console.warn('[Executor] Cookie 登录接口未返回 cookies 数组，未写入 auth.json');
      return;
    }
    const normalized = cookies.map(normalizePlaywrightCookie).filter(Boolean);
    if (!normalized.length) {
      console.warn('[Executor] Cookie 列表规范化后为空（需 name、domain），未写入 auth.json');
      return;
    }
    const origins = Array.isArray(data.origins) ? data.origins : [];
    const storageState = { cookies: normalized, origins };
    await fs.writeFile(authPath, JSON.stringify(storageState, null, 2), 'utf8');
    console.log('[Executor] 已通过 Cookie 登录接口写入 auth.json');
  } catch (e) {
    clearTimeout(timer);
    console.warn('[Executor] Cookie 登录接口调用失败:', e?.message || e);
  }
}

/**
 * 执行前：若手机号(用户名)+密码+企业名称齐全，则调 WPS 账号 API 换 Cookie，写入仓库 auth.json（覆盖此前 WPS_SID / Cookie 接口结果）。
 * 来源：执行环境 test_username / test_password / wps_company_name，或由合并环境变量 E2E_USERNAME、E2E_PASSWORD、WPS_COMPANY_NAME（如 run.env）。
 */
function resolveWpsLoginTriplet(execEnvRow, spawnEnvExtra) {
  const env = { ...process.env, ...spawnEnvExtra };
  const phone =
    (execEnvRow?.test_username && String(execEnvRow.test_username).trim()) ||
    (env.E2E_USERNAME && String(env.E2E_USERNAME).trim()) ||
    '';
  const password =
    (execEnvRow?.test_password && String(execEnvRow.test_password)) ||
    (env.E2E_PASSWORD && String(env.E2E_PASSWORD)) ||
    '';
  const company =
    (execEnvRow?.wps_company_name && String(execEnvRow.wps_company_name).trim()) ||
    (env.WPS_COMPANY_NAME && String(env.WPS_COMPANY_NAME).trim()) ||
    '';
  return { phone, password, company };
}

async function injectAuthFromWpsAccountApi(repoDir, execEnvRow, spawnEnvExtra) {
  const { phone, password, company } = resolveWpsLoginTriplet(execEnvRow, spawnEnvExtra);
  if (!phone || !password || !company) return;

  let loginWpsAccountViaApi;
  try {
    ({ loginWpsAccountViaApi } = await import('./wpsAccountLogin.js'));
  } catch (e) {
    console.warn('[Executor] WPS 账号 API 登录不可用:', e?.message || e);
    return;
  }

  const authPath = path.join(repoDir, 'auth.json');
  try {
    const { cookies } = await loginWpsAccountViaApi({
      phone,
      password,
      companyName: company,
    });
    const normalized = cookies.map(normalizePlaywrightCookie).filter(Boolean);
    if (!normalized.length) {
      console.warn('[Executor] WPS 账号登录返回的 Cookie 规范化后为空，未写入 auth.json');
      return;
    }
    const storageState = { cookies: normalized, origins: [] };
    await fs.writeFile(authPath, JSON.stringify(storageState, null, 2), 'utf8');
    console.log('[Executor] 已通过 WPS 账号 API 登录写入 auth.json（供 Playwright storageState）');
  } catch (e) {
    console.warn('[Executor] WPS 账号 API 登录失败:', e?.message || e);
  }
}

function normalizePlaywrightCookie(c) {
  if (!c || typeof c !== 'object') return null;
  const name = c.name != null ? String(c.name).trim() : '';
  const value = c.value != null ? String(c.value) : '';
  const domain = c.domain != null ? String(c.domain).trim() : '';
  const p = c.path != null ? String(c.path) : '/';
  if (!name || !domain) return null;
  const out = {
    name,
    value,
    domain,
    path: p || '/',
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  };
  if (c.expires != null && c.expires !== '') {
    const n = Number(c.expires);
    if (!Number.isNaN(n)) out.expires = n;
  }
  if (typeof c.httpOnly === 'boolean') out.httpOnly = c.httpOnly;
  if (typeof c.secure === 'boolean') out.secure = c.secure;
  if (c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None') out.sameSite = c.sameSite;
  return out;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/** 在仓库 .env 中写入/清除 UIAuto 注入的 UIAUTO_HOST_RESOLVER_RULES（供 dotenv + Playwright 读取） */
const UIHOST_BLOCK_RE = /\n?# __UIAUTO_HOST_RESOLVER_START__\n[\s\S]*?# __UIAUTO_HOST_RESOLVER_END__\n?/g;

async function mergeUiautoHostResolverIntoRepoDotEnv(repoDir, rulesOneLine) {
  const envPath = path.join(repoDir, '.env');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch (_) {}
  content = content.replace(UIHOST_BLOCK_RE, '\n');
  if (rulesOneLine && String(rulesOneLine).trim()) {
    const v = JSON.stringify(String(rulesOneLine).trim());
    const block = `\n# __UIAUTO_HOST_RESOLVER_START__\nUIAUTO_HOST_RESOLVER_RULES=${v}\n# __UIAUTO_HOST_RESOLVER_END__\n`;
    content = content.trimEnd() + block;
  }
  await fs.writeFile(envPath, content.trimEnd() + '\n', 'utf8');
}

/** 执行前强制无头：临时改写仓库内 playwright 配置的 headless 为 true，返回恢复函数 */
async function forceHeadlessInRepo(repoDir) {
  const names = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'];
  for (const name of names) {
    const configPath = path.join(repoDir, name);
    try {
      let content = await fs.readFile(configPath, 'utf8');
      if (!/headless\s*:/.test(content)) continue;
      const original = content;
      content = content.replace(/headless\s*:\s*(?:false|true|[^,\r\n]+)/g, 'headless: true');
      if (content === original) continue;
      await fs.writeFile(configPath, content, 'utf8');
      return async () => { await fs.writeFile(configPath, original, 'utf8'); };
    } catch (_) {
      continue;
    }
  }
  return () => Promise.resolve();
}

/** 克隆/拉取超时（毫秒），避免网络卡住时长时间等待。可通过环境变量 CLONE_TIMEOUT_MS、PULL_TIMEOUT_MS 覆盖 */
const CLONE_TIMEOUT_MS = Math.max(30000, parseInt(process.env.CLONE_TIMEOUT_MS, 10) || 120000);
const PULL_TIMEOUT_MS = Math.max(20000, parseInt(process.env.PULL_TIMEOUT_MS, 10) || 60000);

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Clone or pull repo — 已废弃，计划执行不再 git clone。
 */

/** 克隆仓库或准备录制 workspace 后，注入执行环境与登录态 */
async function prepareRepoExecutionEnv(repoDir, execEnvRow) {
  const repoEnv = path.join(repoDir, '.env');
  try {
    await fs.copyFile(RUN_ENV_PATH, repoEnv);
  } catch (_) {
    try {
      await fs.copyFile(DATA_ENV_PATH, repoEnv);
    } catch (_2) {}
  }
  const spawnEnvExtra = await prepareExecutionProfileForRepo(repoDir, execEnvRow);
  await mergeUiautoHostResolverIntoRepoDotEnv(repoDir, spawnEnvExtra.UIAUTO_HOST_RESOLVER_RULES || '');
  await injectAuthFromEnv(repoDir);
  await injectAuthFromCookieApi(repoDir, spawnEnvExtra);
  await injectAuthFromWpsAccountApi(repoDir, execEnvRow, spawnEnvExtra);
  const restoreHeadless = await forceHeadlessInRepo(repoDir);
  return { spawnEnvExtra, restoreHeadless };
}

async function prepareRecordedWorkspace(execEnvRow) {
  const repoDir = recordedCasesRoot();
  await installRepoDeps(repoDir, { chromiumOnly: true });
  const env = await prepareRepoExecutionEnv(repoDir, execEnvRow);
  return { repoDir, kind: 'recorded', label: 'uiauto/recorded', ...env };
}

function attachChildToTask(child, taskRef) {
  if (!taskRef) return () => {};
  taskRef.child = child;
  if (taskRef.children) taskRef.children.add(child);
  return () => {
    if (taskRef.child === child) taskRef.child = null;
    if (taskRef.children) taskRef.children.delete(child);
  };
}

/** 必须消费 stdout/stderr，否则 Windows 上 npm 等子进程会因管道缓冲区满而永久挂起 */
function runCmd(cwd, command, args, taskRef = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true, stdio: 'pipe' });
    const detach = attachChildToTask(child, taskRef);
    let err = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      detach();
      resolve({ code, err });
    });
    child.on('error', (err) => {
      detach();
      reject(err);
    });
  });
}

/** 设为 1 时跳过 playwright install --with-deps，避免在服务器上触发 sudo 密码（需事先在服务器执行过 sudo npx playwright install-deps chromium） */
function skipPlaywrightWithDeps() {
  return ['1', 'true', 'yes'].includes(String(process.env.SKIP_PLAYWRIGHT_DEPS || '').toLowerCase());
}

const DEPS_READY_MARKER = '.uiauto-deps-ready';

async function getDepsFingerprint(repoDir) {
  const files = ['package.json', 'package-lock.json'];
  let maxMtime = 0;
  for (const name of files) {
    try {
      const st = await fs.stat(path.join(repoDir, name));
      if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
    } catch (_) {}
  }
  return maxMtime;
}

async function isRepoDepsReady(repoDir) {
  const markerPath = path.join(repoDir, DEPS_READY_MARKER);
  const pwTestPath = path.join(repoDir, 'node_modules', '@playwright', 'test', 'package.json');
  try {
    await fs.access(pwTestPath);
    const markerStat = await fs.stat(markerPath);
    const fp = await getDepsFingerprint(repoDir);
    return markerStat.mtimeMs >= fp;
  } catch {
    return false;
  }
}

async function markRepoDepsReady(repoDir) {
  await fs.writeFile(
    path.join(repoDir, DEPS_READY_MARKER),
    `${new Date().toISOString()}\n`,
    'utf8',
  );
}

/**
 * @param {string} repoDir
 * @param {{ force?: boolean, chromiumOnly?: boolean }} [opts]
 */
async function installRepoDeps(repoDir, opts = {}) {
  const { force = false, chromiumOnly = false, taskRef = null } = opts;
  const pkgPath = path.join(repoDir, 'package.json');
  try {
    await fs.access(pkgPath);
  } catch {
    return;
  }

  if (!force && await isRepoDepsReady(repoDir)) {
    return;
  }

  console.log('[Executor] 安装依赖:', repoDir);
  await runCmd(repoDir, 'npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], taskRef);

  const pwInstallArgs = ['playwright', 'install'];
  if (chromiumOnly) pwInstallArgs.push('chromium');
  else if (!skipPlaywrightWithDeps()) pwInstallArgs.push('--with-deps');

  const pwResult = await runCmd(repoDir, 'npx', pwInstallArgs, taskRef);
  if (pwResult.code !== 0) {
    console.warn(
      '[Executor] playwright install 未成功，用例可能报 Executable doesn\'t exist。请在该目录执行: npx playwright install chromium',
      pwResult.err || '',
    );
  }

  await markRepoDepsReady(repoDir);
  try {
    const { linkCasesRootNodeModules } = await import('./caseWorkspace.js');
    linkCasesRootNodeModules();
  } catch (_) {}
}

/**
 * Playwright 支持的浏览器 project 名，与仓库 playwright.config 中 projects[].name 对应。
 * chromium/firefox/webkit 为内置；chrome/msedge 多数仓库未单独配置，执行时回退到 chromium 以兼容。
 */
const SUPPORTED_BROWSERS = ['chromium', 'chrome', 'msedge', 'firefox', 'webkit'];
/** 执行时传给 Playwright 的 project：chrome/msedge 回退到 chromium，避免 "Project chrome not found" */
const BROWSER_TO_PROJECT = { chrome: 'chromium', msedge: 'chromium' };

/**
 * Run playwright test for one file (headless), capture stdout/stderr and artifacts.
 * taskRef: { runId, child?, children? } — child/children 用于取消时 kill；并行时使用 children
 * browser: string | null — 若指定则只在该 project 上跑（--project）；chrome/msedge 会回退为 chromium 以兼容仓库配置
 */
function runPlaywrightTest(repoDir, casePath, runId, caseId, taskRef, browser = null, spawnEnvExtra = {}, runOpts = {}) {
  return new Promise((resolve, reject) => {
    const resultDir = path.join(RESULTS_DIR, String(runId), String(caseId));
    const outputInRepo = 'test-results-' + String(caseId);
    const headed = !!runOpts.headed;
    const args = [
      'playwright', 'test', casePath,
      '--reporter=list',
      '--output', outputInRepo,
    ];
    if (headed) args.push('--headed');
    const raw = browser ? String(browser).toLowerCase() : '';
    if (raw && SUPPORTED_BROWSERS.includes(raw)) {
      const project = BROWSER_TO_PROJECT[raw] ?? raw;
      args.push('--project', project);
    }
    const cwd = repoDir;
    const authFileInRepo = path.join(repoDir, 'auth.json');
    const childEnv = {
      ...process.env,
      ...spawnEnvExtra,
      PLAYWRIGHT_HTML_REPORT: resultDir,
      AUTH_FILE: authFileInRepo,
    };
    if (headed) {
      childEnv.PLAYWRIGHT_HEADLESS = '0';
      delete childEnv.CI;
    } else {
      childEnv.CI = '1';
      childEnv.PLAYWRIGHT_HEADLESS = '1';
    }
    const child = spawn('npx', args, {
      cwd,
      shell: true,
      env: childEnv,
    });
    const removeChild = () => {
      if (taskRef) {
        taskRef.child = null;
        if (taskRef.children) taskRef.children.delete(child);
      }
    };
    if (taskRef) {
      taskRef.child = child;
      if (taskRef.children) taskRef.children.add(child);
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      removeChild();
      resolve({
        code,
        stdout,
        stderr,
        cwd,
        resultDir: path.join(cwd, outputInRepo),
      });
    });
    child.on('error', (err) => {
      removeChild();
      reject(err);
    });
  });
}

/**
 * Copy test-results (screenshots, videos, traces) to run result dir.
 */
async function copyArtifacts(fromResultDir, toResultDir, casePath) {
  await ensureDir(toResultDir);
  try {
    const entries = await fs.readdir(fromResultDir, { withFileTypes: true });
    for (const e of entries) {
      const src = path.join(fromResultDir, e.name);
      const dest = path.join(toResultDir, e.name);
      if (e.isDirectory()) {
        await copyArtifacts(src, dest, casePath);
      } else {
        await fs.copyFile(src, dest);
      }
    }
  } catch (_) {
    // no test-results dir or empty
  }
}

/**
 * Find first screenshot, video, trace in dir (recursive), and all screenshots for step report.
 */
async function findArtifacts(dir) {
  const out = { screenshot: null, video: null, trace: null, screenshots: [] };
  const walk = async (d) => {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const lower = e.name.toLowerCase();
        if (lower.endsWith('.png')) {
          if (!out.screenshot) out.screenshot = full;
          out.screenshots.push(full);
        }
        if (lower.endsWith('.webm') || lower.endsWith('.mp4')) {
          if (!out.video) out.video = full;
          else {
            try {
              const cur = (await fs.stat(out.video)).size;
              const next = (await fs.stat(full)).size;
              if (next > cur) out.video = full;
            } catch (_) {
              out.video = full;
            }
          }
        }
        if (lower.endsWith('.zip') && e.name.includes('trace') && !out.trace) out.trace = full;
      }
    }
  };
  await walk(dir);
  out.screenshots.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * 取消正在执行的任务：若 runId 是当前正在执行的，则 kill 所有相关子进程（由调用方负责更新 DB 状态）
 */
export function cancelRun(runId) {
  const id = Number(runId);
  if (runningTask.runId !== id) return;
  if (runningTask.child) {
    try { runningTask.child.kill('SIGTERM'); } catch (_) {}
    runningTask.child = null;
  }
  if (runningTask.children && runningTask.children.size > 0) {
    for (const child of runningTask.children) {
      try { child.kill('SIGTERM'); } catch (_) {}
    }
    runningTask.children.clear();
  }
}

/**
 * Queue execution of a plan. runId and plan must exist in DB.
 */
export function executePlan(runId, plan) {
  queue.add(async () => {
    const { runPlanCases } = await import('./caseRunner.js');
    await runPlanCases(runId, plan);
  });
}

/**
 * 在指定仓库目录执行单个 Playwright 用例（供录制试跑等场景复用环境注入逻辑）。
 */
export async function runSingleCaseInRepo(repoDir, casePath, execEnvRow, options = {}) {
  const {
    runId = '0',
    caseRowId = '0',
    taskRef = null,
    browser = null,
    headed = false,
    chromiumOnly = false,
    forceDeps = false,
    storageState = null,
  } = options;

  await installRepoDeps(repoDir, { chromiumOnly, force: forceDeps, taskRef });

  const repoEnv = path.join(repoDir, '.env');
  try {
    await fs.copyFile(RUN_ENV_PATH, repoEnv);
  } catch (_) {
    try {
      await fs.copyFile(DATA_ENV_PATH, repoEnv);
    } catch (_2) {}
  }

  const spawnEnvExtra = await prepareExecutionProfileForRepo(repoDir, execEnvRow);
  await mergeUiautoHostResolverIntoRepoDotEnv(repoDir, spawnEnvExtra.UIAUTO_HOST_RESOLVER_RULES || '');
  const hadRecordedAuth = await injectRecordedStorageState(repoDir, storageState);
  if (!hadRecordedAuth) {
    await injectAuthFromEnv(repoDir);
    await injectAuthFromCookieApi(repoDir, spawnEnvExtra);
    await injectAuthFromWpsAccountApi(repoDir, execEnvRow, spawnEnvExtra);
  }

  const restoreHeadless = headed ? (() => Promise.resolve()) : await forceHeadlessInRepo(repoDir);
  try {
    return await runPlaywrightTest(
      repoDir,
      casePath,
      runId,
      caseRowId,
      taskRef,
      browser,
      spawnEnvExtra,
      { headed },
    );
  } finally {
    await restoreHeadless();
  }
}

export { copyArtifacts, findArtifacts };
