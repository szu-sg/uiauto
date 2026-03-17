import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import PQueue from 'p-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '../../repos');
const RESULTS_DIR = path.join(__dirname, '../../results');
const queue = new PQueue({ concurrency: 1 });

/** 多浏览器/用例并行数（同时运行的 Playwright 进程数），可通过环境变量 RUN_CONCURRENCY 覆盖 */
const RUN_CONCURRENCY = Math.max(1, parseInt(process.env.RUN_CONCURRENCY, 10) || 3);

/** 当前正在执行的任务，用于取消时 kill 子进程；children 在并行时会有多个 */
const runningTask = { runId: null, child: null, children: new Set() };

/** 供 /api/status 查询当前是否在执行及 runId */
export function getRunningRunId() {
  return runningTask.runId ?? null;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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
        await g.pull();
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
    const child = spawn('npx', args, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: '1',
        PLAYWRIGHT_HTML_REPORT: resultDir,
        PLAYWRIGHT_HEADLESS: '1',
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
    const setRunStatus = db.prepare('UPDATE runs SET status = ?, started_at = COALESCE(started_at, datetime(\'now\', \'localtime\')), finished_at = datetime(\'now\', \'localtime\'), log_text = ?, progress_phase = NULL WHERE id = ?');
    const updateRun = db.prepare('UPDATE runs SET status = ?, started_at = datetime(\'now\', \'localtime\') WHERE id = ?');
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

      const afterSetup = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (afterSetup && afterSetup.status === 'cancelled') return;

      updateProgress.run('running', runId);
      const runQueue = new PQueue({ concurrency: RUN_CONCURRENCY });
      const logChunks = [];

      await Promise.all(tasks.map((task) =>
        runQueue.add(async () => {
          const again = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
          if (again && again.status === 'cancelled') return;

          const { casePath, browser, caseRowId } = task;
          const caseResultDir = path.join(runCasesDir, String(caseRowId));
          await ensureDir(caseResultDir);

          const start = Date.now();
          const result = await runPlaywrightTest(repoDir, casePath, runId, caseRowId, runningTask, browser);
          const duration = Date.now() - start;
          const browserLabel = browser || 'default';
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
      db.prepare('UPDATE runs SET status = \'done\', finished_at = datetime(\'now\', \'localtime\'), result_dir = ?, log_text = ?, progress_phase = NULL WHERE id = ?')
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
