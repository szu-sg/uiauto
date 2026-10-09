import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterEssentialStorageState, storageStateUsableForLogin } from '../utils/essentialCookies.js';
import { RECORDED_CASES_ROOT } from './recordedCases.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CASES_ROOT = path.join(__dirname, '../../data/cases');
export const WORKSPACE_ROOT = path.join(CASES_ROOT, '_workspace');
export const DEFAULT_SCRIPT = 'case.spec.ts';
export const AUTH_FILE = 'case.auth.json';
export const ENV_SNAPSHOT_FILE = 'env.snapshot.json';

const PACKAGE_JSON = {
  name: 'uiauto-cases-workspace',
  private: true,
  type: 'module',
  dependencies: {
    '@playwright/test': '^1.49.1',
    dotenv: '^17.3.1',
  },
};

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
const authFile = process.env.AUTH_FILE || 'auth.json';
const headed = process.env.PLAYWRIGHT_HEADLESS === '0';
const hostRules = process.env.UIAUTO_HOST_RESOLVER_RULES
  ? String(process.env.UIAUTO_HOST_RESOLVER_RULES).trim()
  : '';
const launchArgs = [];
if (hostRules) launchArgs.push(\`--host-resolver-rules=\${hostRules}\`);
if (headed) launchArgs.push('--start-maximized');

export default defineConfig({
  testDir: '..',
  testMatch: '**/*.{spec,test}.{ts,js}',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: !headed,
    ...(headed
      ? {
          viewport: null,
          launchOptions: { args: launchArgs.length ? launchArgs : ['--start-maximized'] },
        }
      : {
          viewport: { width: 1920, height: 1080 },
          ...(launchArgs.length ? { launchOptions: { args: launchArgs } } : {}),
        }),
    ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
`;

export function caseDir(teamId, caseId) {
  return path.join(CASES_ROOT, String(teamId), String(caseId));
}

export function scriptAbsPath(teamId, caseId, scriptPath = DEFAULT_SCRIPT) {
  const rel = String(scriptPath || DEFAULT_SCRIPT).replace(/^\/+/, '');
  if (rel.includes('..')) throw new Error('非法脚本路径');
  return path.join(caseDir(teamId, caseId), rel);
}

/** Playwright 工作目录内相对路径，如 12/34/case.spec.ts */
export function playwrightCasePath(teamId, caseId, scriptPath = DEFAULT_SCRIPT) {
  const rel = String(scriptPath || DEFAULT_SCRIPT).replace(/^\/+/, '');
  return path.join(String(teamId), String(caseId), rel).replace(/\\/g, '/');
}

/** 用例脚本在 data/cases/{team}/{id}/，依赖装在 _workspace；Node 从脚本目录向上解析 import，需在 cases 根目录链到 workspace 的 node_modules */
export function linkCasesRootNodeModules() {
  const target = path.join(WORKSPACE_ROOT, 'node_modules');
  const link = path.join(CASES_ROOT, 'node_modules');
  if (!fs.existsSync(target)) return;
  try {
    if (fs.existsSync(link)) {
      const st = fs.lstatSync(link);
      if (st.isSymbolicLink()) {
        try {
          if (fs.realpathSync(link) === fs.realpathSync(target)) return;
        } catch (_) {}
      }
      return;
    }
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(target, link, linkType);
  } catch (e) {
    console.warn('[caseWorkspace] linkCasesRootNodeModules:', e?.message || e);
  }
}

export const SMOKE_SHARED_HELPERS = 'smoke-knowledge-helpers.mjs';

/** 知识基座冒烟：共享 helper 供各用例 import（data/cases/_shared/） */
export function ensureSmokeKnowledgeShared() {
  ensureWorkspaceShell();
  const sharedDir = path.join(CASES_ROOT, '_shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  const dest = path.join(sharedDir, SMOKE_SHARED_HELPERS);
  const candidates = [
    path.join(__dirname, '../../../scripts/smoke-split/_shared', SMOKE_SHARED_HELPERS),
    path.join(process.cwd(), 'scripts/smoke-split/_shared', SMOKE_SHARED_HELPERS),
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn('[caseWorkspace] smoke shared helpers not found on disk, skip copy');
    return dest;
  }
  fs.copyFileSync(src, dest);
  return dest;
}

export function ensureWorkspaceShell() {
  fs.mkdirSync(CASES_ROOT, { recursive: true });
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`, 'utf8');
  }
  const cfgPath = path.join(WORKSPACE_ROOT, 'playwright.config.ts');
  fs.writeFileSync(cfgPath, PLAYWRIGHT_CONFIG, 'utf8');
  linkCasesRootNodeModules();
}

export function ensureCaseDir(teamId, caseId) {
  ensureWorkspaceShell();
  const dir = caseDir(teamId, caseId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeScript(teamId, caseId, script, scriptPath = DEFAULT_SCRIPT) {
  const full = scriptAbsPath(teamId, caseId, scriptPath);
  ensureCaseDir(teamId, caseId);
  fs.writeFileSync(full, String(script), 'utf8');
  return full;
}

export function readScript(teamId, caseId, scriptPath = DEFAULT_SCRIPT) {
  const full = scriptAbsPath(teamId, caseId, scriptPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

export function writeAuth(teamId, caseId, storageState) {
  const filtered = filterEssentialStorageState(storageState);
  if (!filtered) return null;
  const cookies = filtered.cookies;
  const origins = filtered.origins;
  if (!cookies.length && !origins.length) return null;
  const full = path.join(ensureCaseDir(teamId, caseId), AUTH_FILE);
  fs.writeFileSync(full, JSON.stringify({ cookies, origins }, null, 2), 'utf8');
  return full;
}

export function loadAuth(teamId, caseId) {
  const full = path.join(caseDir(teamId, caseId), AUTH_FILE);
  if (!fs.existsSync(full)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    const cookies = Array.isArray(data.cookies) ? data.cookies : [];
    const origins = Array.isArray(data.origins) ? data.origins : [];
    if (!cookies.length && !origins.length) return null;
    return { cookies, origins };
  } catch {
    return null;
  }
}

export function writeEnvSnapshot(teamId, caseId, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const full = path.join(ensureCaseDir(teamId, caseId), ENV_SNAPSHOT_FILE);
  fs.writeFileSync(full, JSON.stringify(snapshot, null, 2), 'utf8');
  return full;
}

export function removeCaseWorkspace(teamId, caseId) {
  const dir = caseDir(teamId, caseId);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

/** 从旧 recorded-cases 目录迁移单文件 */
export function importLegacyFile(teamId, caseId, legacyPath, scriptPath = DEFAULT_SCRIPT) {
  const rel = String(legacyPath || '').trim().replace(/^\/+/, '');
  if (!rel) return false;
  const src = path.join(RECORDED_CASES_ROOT, rel);
  if (!fs.existsSync(src)) return false;
  const dest = scriptAbsPath(teamId, caseId, scriptPath);
  ensureCaseDir(teamId, caseId);
  fs.copyFileSync(src, dest);
  const dot = rel.lastIndexOf('.');
  const authSrc = path.join(RECORDED_CASES_ROOT, `${dot > 0 ? rel.slice(0, dot) : rel}.auth.json`);
  if (fs.existsSync(authSrc)) {
    fs.copyFileSync(authSrc, path.join(caseDir(teamId, caseId), AUTH_FILE));
  }
  return true;
}

/**
 * @param {{ forRun?: boolean, loginPreference?: 'auto'|'case_context'|'plan_env' }} options
 */
export function resolveStorageState(teamId, caseId, inlineState = null, options = {}) {
  const { forRun = false, loginPreference = 'auto' } = options;
  if (forRun && loginPreference === 'plan_env') return null;

  const filtered = filterEssentialStorageState(inlineState);
  let state = null;
  if (filtered?.cookies?.length || filtered?.origins?.length) {
    state = filtered;
  } else {
    state = loadAuth(teamId, caseId);
    if (state) {
      const again = filterEssentialStorageState(state);
      state = again?.cookies?.length ? again : null;
    }
  }

  if (!state) return null;
  if (forRun && loginPreference === 'auto' && !storageStateUsableForLogin(state)) {
    console.log('[Auth] 用例 Cookie 缺失或已过期，执行将使用计划/环境账号登录');
    return null;
  }
  return state;
}

export function clearAuth(teamId, caseId) {
  const full = path.join(caseDir(teamId, caseId), AUTH_FILE);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {}
}
