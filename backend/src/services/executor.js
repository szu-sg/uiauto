import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { parse as dotenvParse } from 'dotenv';
import PQueue from 'p-queue';

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

/** 当前正在执行的任务，用于取消时 kill 子进程；children 在并行时会有多个 */
const runningTask = { runId: null, child: null, children: new Set() };

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
  if (!content) {
    console.warn('[Executor] 未找到 run.env 或 .env，跳过登录态注入。请配置 backend/data/run.env 或 backend/data/.env 中的 WPS_SID');
    return;
  }
  const parsed = dotenvParse(content);
  const wpsSid = parsed.WPS_SID && String(parsed.WPS_SID).trim();
  if (!wpsSid) {
    console.warn('[Executor] 未在 .env/run.env 中找到 WPS_SID，跳过登录态注入');
    return;
  }

  const genAuthPath = path.join(repoDir, '.uiauto-gen-auth.cjs');
  const authPath = path.join(repoDir, 'auth.json');
  try {
    await fs.writeFile(genAuthPath, GEN_AUTH_SCRIPT.trim(), 'utf8');
    const { code } = await new Promise((resolve, reject) => {
      const child = spawn('node', ['.uiauto-gen-auth.cjs'], {
        cwd: repoDir,
        shell: false,
        stdio: 'pipe',
      });
      let err = '';
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

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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

/** 克隆/拉取超时（毫秒），避免网络卡住时无限等待。可通过环境变量 CLONE_TIMEOUT_MS、PULL_TIMEOUT_MS 覆盖 */
const CLONE_TIMEOUT_MS = Math.max(60000, parseInt(process.env.CLONE_TIMEOUT_MS, 10) || 300000);
const PULL_TIMEOUT_MS = Math.max(30000, parseInt(process.env.PULL_TIMEOUT_MS, 10) || 120000);

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/**
 * Clone or pull repo, return local path.
 * 带超时，超时或网络失败会抛错，避免一直卡在「正在克隆仓库」。
 */
async function ensureRepo(owner, repo, branch) {
  const dir = path.join(REPOS_DIR, `${owner}_${repo}`);
  await ensureDir(REPOS_DIR);
  const git = (await import('simple-git')).default;
  const gitImpl = git(REPOS_DIR);

  if (await fs.access(dir).then(() => true).catch(() => false)) {
    const g = git(dir);
    await withTimeout(
      (async () => {
        await g.fetch();
        await g.checkout(branch).catch(() => {});
        await g.reset(['--hard', 'origin/' + branch]);
      })(),
      PULL_TIMEOUT_MS,
      `拉取仓库超时（${PULL_TIMEOUT_MS / 1000} 秒）。请检查网络、代理或 GitHub 可达性。`
    );
    return dir;
  }
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  await withTimeout(
    gitImpl.clone(cloneUrl, path.basename(dir), ['--branch', branch, '--single-branch']),
    CLONE_TIMEOUT_MS,
    `克隆仓库超时（${CLONE_TIMEOUT_MS / 1000} 秒）。请检查：1) 网络与代理；2) 仓库是否为私有（私有库需在本机配置 git 凭据）；3) 分支名是否正确。`
  );
  return dir;
}

function runCmd(cwd, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true, stdio: 'pipe' });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => resolve({ code, err }));
    child.on('error', reject);
  });
}

async function installRepoDeps(repoDir) {
  const pkgPath = path.join(repoDir, 'package.json');
  try {
    await fs.access(pkgPath);
  } catch {
    return;
  }
  await runCmd(repoDir, 'npm', ['install', '--no-audit', '--no-fund']);
  await runCmd(repoDir, 'npx', ['playwright', 'install', '--with-deps']).catch(() => {});
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
function runPlaywrightTest(repoDir, casePath, runId, caseId, taskRef, browser = null) {
  return new Promise((resolve, reject) => {
    const resultDir = path.join(RESULTS_DIR, String(runId), String(caseId));
    const outputInRepo = 'test-results-' + String(caseId);
    const args = [
      'playwright', 'test', casePath,
      '--reporter=list',
      '--output', outputInRepo,
    ];
    const raw = browser ? String(browser).toLowerCase() : '';
    if (raw && SUPPORTED_BROWSERS.includes(raw)) {
      const project = BROWSER_TO_PROJECT[raw] ?? raw;
      args.push('--project', project);
    }
    const cwd = repoDir;
    const authFileInRepo = path.join(repoDir, 'auth.json');
    const child = spawn('npx', args, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: '1',
        PLAYWRIGHT_HTML_REPORT: resultDir,
        PLAYWRIGHT_HEADLESS: '1',
        // 显式指定 auth 文件绝对路径，确保 playwright.config 的 storageState 使用我们生成的 auth.json
        AUTH_FILE: authFileInRepo,
      },
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
 * Find first screenshot, video, trace in dir (recursive).
 */
async function findArtifacts(dir) {
  const out = { screenshot: null, video: null, trace: null };
  const walk = async (d) => {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const lower = e.name.toLowerCase();
        if (lower.endsWith('.png') && !out.screenshot) out.screenshot = full;
        if ((lower.endsWith('.webm') || lower.endsWith('.mp4')) && !out.video) out.video = full;
        if (lower.endsWith('.zip') && e.name.includes('trace') && !out.trace) out.trace = full;
      }
    }
  };
  await walk(dir);
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
    const { db } = await import('../db/schema.js');
    const setRunStatus = db.prepare("UPDATE runs SET status = ?, started_at = COALESCE(started_at, datetime('now', '+8 hours')), finished_at = datetime('now', '+8 hours'), log_text = ?, progress_phase = NULL WHERE id = ?");
    const updateRun = db.prepare("UPDATE runs SET status = ?, started_at = datetime('now', '+8 hours') WHERE id = ?");
    const updateProgress = db.prepare('UPDATE runs SET progress_phase = ? WHERE id = ?');

    try {
      const id = Number(runId);
      const existing = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (existing && existing.status === 'cancelled') return;

      // 先写入 run_cases，再克隆/安装依赖，这样中途取消时报告里也能看到用例列表（均为 pending）
      const cases = JSON.parse(plan.cases_json || '[]');
      let runBrowsers = null;
      try {
        if (plan.run_browsers_json) {
          const arr = JSON.parse(plan.run_browsers_json);
          if (Array.isArray(arr) && arr.length > 0) runBrowsers = arr;
        }
      } catch (_) {}

      const updateCase = db.prepare(`
        UPDATE run_cases SET status = ?, duration_ms = ?, error_message = ?, screenshot_path = ?, video_path = ?, trace_path = ?, log_path = ?
        WHERE id = ?
      `);
      const insertCase = db.prepare(`
        INSERT INTO run_cases (run_id, case_path, browser, status) VALUES (?, ?, ?, 'pending')
      `);

      /** 待执行任务：{ casePath, browser, caseRowId }，browser 为 null 表示不指定 project */
      const tasks = [];
      if (Array.isArray(runBrowsers) && runBrowsers.length > 0) {
        const projects = runBrowsers.filter((b) => SUPPORTED_BROWSERS.includes(String(b).toLowerCase()));
        for (const casePath of cases) {
          for (const browser of projects) {
            insertCase.run(runId, casePath, browser);
            tasks.push({ casePath, browser, caseRowId: db.prepare('SELECT last_insert_rowid()').pluck().get() });
          }
        }
      } else {
        for (const casePath of cases) {
          insertCase.run(runId, casePath, null);
          tasks.push({ casePath, browser: null, caseRowId: db.prepare('SELECT last_insert_rowid()').pluck().get() });
        }
      }

      // 队列一接手任务就标记为运行中
      updateRun.run('running', runId);
      runningTask.runId = id;
      runningTask.child = null;
      runningTask.children.clear();

      const runCasesDir = path.join(RESULTS_DIR, String(runId));
      await ensureDir(runCasesDir);

      updateProgress.run('cloning', runId);
      const repoDir = await ensureRepo(plan.repo_owner, plan.repo_name, plan.repo_branch || 'main');
      if (db.prepare('SELECT status FROM runs WHERE id = ?').get(id)?.status === 'cancelled') return;

      updateProgress.run('installing', runId);
      await installRepoDeps(repoDir);

      // 用例仓库内 .env 通常被 .gitignore，克隆后不存在。若配置了 data/run.env 或 data/.env，复制到仓库根供用例与生成脚本读取
      const repoEnv = path.join(repoDir, '.env');
      try {
        await fs.copyFile(RUN_ENV_PATH, repoEnv);
      } catch (_) {
        try {
          await fs.copyFile(DATA_ENV_PATH, repoEnv);
        } catch (_2) {}
      }

      // Playwright 使用 storageState（如 auth.json）带登录态，不是直接读 .env。根据 .env 中的 WPS_SID 生成 auth.json
      await injectAuthFromEnv(repoDir);

      const afterSetup = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (afterSetup && afterSetup.status === 'cancelled') return;

      updateProgress.run('running', runId);
      const restoreHeadless = await forceHeadlessInRepo(repoDir);
      const runQueue = new PQueue({ concurrency: RUN_CONCURRENCY });
      const logChunks = [];

      try {
        await Promise.all(tasks.map((task) =>
          runQueue.add(async () => {
            const again = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
            if (again && again.status === 'cancelled') return;

            const { casePath, browser, caseRowId } = task;
            const caseResultDir = path.join(runCasesDir, String(caseRowId));
            await ensureDir(caseResultDir);

            const start = Date.now();
            let result = await runPlaywrightTest(repoDir, casePath, runId, caseRowId, runningTask, browser);
            // 仓库若只配置了 chromium（firefox/webkit 被注释），请求 firefox/webkit 会报 Project(s) "firefox" not found，自动用 chromium 重试
            const projectNotFound = result.code !== 0 && /Project\(s\)\s*"[^"]+"\s*not found[\s\S]*Available projects:/i.test(result.stderr);
            if (projectNotFound && browser && browser.toLowerCase() !== 'chromium') {
              result = await runPlaywrightTest(repoDir, casePath, runId, caseRowId, runningTask, 'chromium');
              logChunks.push(`\n[${casePath}] 仓库未配置 "${browser}"，已用 chromium 重试\n`);
            }
            const duration = Date.now() - start;
            const browserLabel = (projectNotFound && browser && browser.toLowerCase() !== 'chromium') ? 'chromium (fallback)' : (browser || 'default');
            logChunks.push(`\n--- ${casePath} [${browserLabel}] (exit ${result.code}) ---\n${result.stdout}\n${result.stderr}\n`);

            const fromResult = path.join(repoDir, 'test-results-' + String(caseRowId));
            await copyArtifacts(fromResult, caseResultDir, casePath);
            const artifacts = await findArtifacts(caseResultDir);
            const logPath = path.join(caseResultDir, 'log.txt');
            await fs.writeFile(logPath, result.stdout + '\n' + result.stderr, 'utf8');

            const rel = (p) => (p ? path.relative(RESULTS_DIR, p).replace(/\\/g, '/') : null);
            updateCase.run(
              result.code === 0 ? 'passed' : 'failed',
              duration,
              result.code !== 0 ? result.stderr.slice(-500) : null,
              rel(artifacts.screenshot),
              rel(artifacts.video),
              rel(artifacts.trace),
              rel(logPath),
              caseRowId
            );
          })
        ));
      } finally {
        await restoreHeadless();
      }

      const logAcc = logChunks.join('');
      runningTask.runId = null;
      runningTask.child = null;
      runningTask.children.clear();
      updateProgress.run(null, runId);

      const runLogPath = path.join(runCasesDir, 'run.log');
      await fs.writeFile(runLogPath, logAcc, 'utf8');
      const afterStatus = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (afterStatus && afterStatus.status === 'cancelled') {
        setRunStatus.run('cancelled', '用户手动停止', runId);
        return;
      }
      db.prepare("UPDATE runs SET status = 'done', finished_at = datetime('now', '+8 hours'), result_dir = ?, log_text = ?, progress_phase = NULL WHERE id = ?")
        .run(path.relative(RESULTS_DIR, runCasesDir).replace(/\\/g, '/'), logAcc.slice(-2000), runId);
    } catch (err) {
      runningTask.runId = null;
      runningTask.child = null;
      runningTask.children.clear();
      try { updateProgress.run(null, runId); } catch (_) {}
      const msg = err?.message || String(err);
      console.error('[Executor] runId=%s error:', runId, msg);
      setRunStatus.run('failed', `执行失败: ${msg}`, runId);
    }
  });
}
