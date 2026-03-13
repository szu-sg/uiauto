import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import PQueue from 'p-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '../../repos');
const RESULTS_DIR = path.join(__dirname, '../../results');
const queue = new PQueue({ concurrency: 1 });

/** 当前正在执行的任务，用于取消时 kill 子进程 */
const runningTask = { runId: null, child: null };

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Clone or pull repo, return local path.
 */
async function ensureRepo(owner, repo, branch) {
  const dir = path.join(REPOS_DIR, `${owner}_${repo}`);
  await ensureDir(REPOS_DIR);
  const git = (await import('simple-git')).default;
  const gitImpl = git(REPOS_DIR);

  if (await fs.access(dir).then(() => true).catch(() => false)) {
    const g = git(dir);
    await g.fetch();
    await g.checkout(branch).catch(() => {});
    await g.pull();
    return dir;
  }
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  await gitImpl.clone(cloneUrl, path.basename(dir), ['--branch', branch, '--single-branch']);
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
 * Run playwright test for one file (headless), capture stdout/stderr and artifacts.
 * taskRef: { runId, child } — child 会在 spawn 后写入，便于外部 kill 取消
 */
function runPlaywrightTest(repoDir, casePath, runId, caseId, taskRef) {
  return new Promise((resolve, reject) => {
    const resultDir = path.join(RESULTS_DIR, String(runId), String(caseId));
    const args = [
      'playwright', 'test', casePath,
      '--reporter=list',
      '--output=test-results',
    ];
    const cwd = repoDir;
    const child = spawn('npx', args, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: '1',
        PLAYWRIGHT_HTML_REPORT: resultDir,
      },
    });
    if (taskRef) {
      taskRef.child = child;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (taskRef) taskRef.child = null;
      resolve({
        code,
        stdout,
        stderr,
        cwd,
        resultDir: path.join(cwd, 'test-results'),
      });
    });
    child.on('error', (err) => {
      if (taskRef) taskRef.child = null;
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
 * 取消正在执行的任务：若 runId 是当前正在执行的，则 kill 子进程（由调用方负责更新 DB 状态）
 */
export function cancelRun(runId) {
  const id = Number(runId);
  if (runningTask.runId === id && runningTask.child) {
    try {
      runningTask.child.kill('SIGTERM');
    } catch (_) {}
    runningTask.child = null;
  }
}

/**
 * Queue execution of a plan. runId and plan must exist in DB.
 */
export function executePlan(runId, plan) {
  queue.add(async () => {
    const { db } = await import('../db/schema.js');
    const setRunStatus = db.prepare('UPDATE runs SET status = ?, started_at = COALESCE(started_at, datetime(\'now\')), finished_at = datetime(\'now\'), log_text = ? WHERE id = ?');
    const updateRun = db.prepare('UPDATE runs SET status = ?, started_at = datetime(\'now\') WHERE id = ?');

    try {
      const id = Number(runId);
      const existing = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (existing && existing.status === 'cancelled') return;

      // 队列一接手任务就标记为运行中，避免克隆/安装依赖卡住时一直显示「排队中」
      updateRun.run('running', runId);
      runningTask.runId = id;
      runningTask.child = null;

      const runCasesDir = path.join(RESULTS_DIR, String(runId));
      await ensureDir(runCasesDir);
      const repoDir = await ensureRepo(plan.repo_owner, plan.repo_name, plan.repo_branch || 'main');
      await installRepoDeps(repoDir);
      const cases = JSON.parse(plan.cases_json || '[]');

      const updateCase = db.prepare(`
        UPDATE run_cases SET status = ?, duration_ms = ?, error_message = ?, screenshot_path = ?, video_path = ?, trace_path = ?, log_path = ?
        WHERE id = ?
      `);
      const insertCase = db.prepare(`
        INSERT INTO run_cases (run_id, case_path, status) VALUES (?, ?, 'pending')
      `);

      let logAcc = '';
      for (let i = 0; i < cases.length; i++) {
        const again = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
        if (again && again.status === 'cancelled') {
          logAcc += '\n[已取消]\n';
          break;
        }
        const casePath = cases[i];
        const insert = insertCase.run(runId, casePath);
        const caseRowId = insert.lastInsertRowid;
        const caseResultDir = path.join(runCasesDir, String(caseRowId));
        await ensureDir(caseResultDir);

        const start = Date.now();
        const result = await runPlaywrightTest(repoDir, casePath, runId, caseRowId, runningTask);
        runningTask.child = null;
        const duration = Date.now() - start;
        logAcc += `\n--- ${casePath} (exit ${result.code}) ---\n${result.stdout}\n${result.stderr}\n`;

        const fromResult = path.join(repoDir, 'test-results');
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
      }

      runningTask.runId = null;
      runningTask.child = null;

      const runLogPath = path.join(runCasesDir, 'run.log');
      await fs.writeFile(runLogPath, logAcc, 'utf8');
      const afterStatus = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
      if (afterStatus && afterStatus.status === 'cancelled') {
        setRunStatus.run('cancelled', '用户手动停止', runId);
        return;
      }
      db.prepare('UPDATE runs SET status = \'done\', finished_at = datetime(\'now\'), result_dir = ?, log_text = ? WHERE id = ?')
        .run(path.relative(RESULTS_DIR, runCasesDir).replace(/\\/g, '/'), logAcc.slice(-2000), runId);
    } catch (err) {
      runningTask.runId = null;
      runningTask.child = null;
      const msg = err?.message || String(err);
      console.error('[Executor] runId=%s error:', runId, msg);
      setRunStatus.run('failed', `执行失败: ${msg}`, runId);
    }
  });
}
