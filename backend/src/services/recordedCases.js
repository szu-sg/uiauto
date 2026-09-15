import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RECORDED_CASES_ROOT = path.join(__dirname, '../../data/recorded-cases');

const PACKAGE_JSON = {
  name: 'uiauto-recorded-cases',
  private: true,
  type: 'module',
  dependencies: {
    '@playwright/test': '^1.49.1',
    dotenv: '^17.3.1',
  },
};

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';
import fs from 'fs';

const authFile = process.env.AUTH_FILE || 'auth.json';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.{spec,test}.{ts,js}',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
`;

export function isRecordedRepo(owner, repo) {
  return String(owner).trim() === 'uiauto' && String(repo).trim() === 'recorded';
}

export function ensureRecordedWorkspace() {
  fs.mkdirSync(RECORDED_CASES_ROOT, { recursive: true });
  fs.mkdirSync(path.join(RECORDED_CASES_ROOT, 'recorded'), { recursive: true });

  const pkgPath = path.join(RECORDED_CASES_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`, 'utf8');
  }

  const cfgPath = path.join(RECORDED_CASES_ROOT, 'playwright.config.ts');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, PLAYWRIGHT_CONFIG, 'utf8');
  } else {
    try {
      let cfg = fs.readFileSync(cfgPath, 'utf8');
      if (/headless:\s*true/.test(cfg)) {
        cfg = cfg.replace(/headless:\s*true/g, 'headless: false');
      }
      if (!/fs\.existsSync\(authFile\)/.test(cfg)) {
        cfg = PLAYWRIGHT_CONFIG;
      }
      fs.writeFileSync(cfgPath, cfg, 'utf8');
    } catch (_) {}
  }
}

/** 将录制脚本写入本地目录，供后续执行引擎读取 */
export function persistRecordedScript(casePath, script) {
  ensureRecordedWorkspace();
  const rel = String(casePath || '').trim().replace(/^\/+/, '');
  if (!rel || !script) return null;
  const full = path.join(RECORDED_CASES_ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(script), 'utf8');
  return full;
}

/** recorded/foo.spec.ts → recorded/foo.auth.json */
export function recordedAuthSidecarPath(casePath) {
  const rel = String(casePath || '').trim().replace(/^\/+/, '');
  if (!rel) return null;
  const dot = rel.lastIndexOf('.');
  const base = dot > 0 ? rel.slice(0, dot) : rel;
  return path.join(RECORDED_CASES_ROOT, `${base}.auth.json`);
}

/** 将录制登录态写入用例仓库 sidecar（与脚本同目录） */
export function persistRecordedAuth(casePath, storageState) {
  const filtered = filterEssentialStorageState(storageState);
  if (!filtered) return null;
  const cookies = filtered.cookies;
  const origins = filtered.origins;
  if (!cookies.length && !origins.length) return null;

  ensureRecordedWorkspace();
  const full = recordedAuthSidecarPath(casePath);
  if (!full) return null;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify({ cookies, origins }, null, 2), 'utf8');
  return full;
}

export function loadRecordedAuth(casePath) {
  const full = recordedAuthSidecarPath(casePath);
  if (!full || !fs.existsSync(full)) return null;
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

export function removeRecordedAuth(casePath) {
  const full = recordedAuthSidecarPath(casePath);
  if (!full) return;
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {}
}

export function resolveRecordedStorageState(casePath, inlineState = null) {
  const filtered = filterEssentialStorageState(inlineState);
  if (filtered?.cookies?.length || filtered?.origins?.length) return filtered;
  return loadRecordedAuth(casePath);
}

export function removeRecordedScript(casePath) {
  const rel = String(casePath || '').trim().replace(/^\/+/, '');
  if (!rel) return;
  const full = path.join(RECORDED_CASES_ROOT, rel);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) {}
  removeRecordedAuth(casePath);
}

export function resolveRecordedCasePath(casePath) {
  const rel = String(casePath || '').trim().replace(/^\/+/, '');
  if (!rel) return null;
  return path.join(RECORDED_CASES_ROOT, rel);
}
