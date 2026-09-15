import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { db } from '../db/schema.js';
import { runCase } from './caseRunner.js';
import { WORKSPACE_ROOT } from './caseWorkspace.js';
import { snapshotToExecEnvRow } from './resolveEnvironment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const JOBS_DIR = path.join(__dirname, '../../data/recorded-run-jobs');
export const RESULTS_DIR = path.join(__dirname, '../../results');
export const WORKER_PATH = path.join(__dirname, '../workers/recordedRunWorker.js');

export function pidFilePath(runId) {
  return path.join(JOBS_DIR, `${runId}.pid`);
}

export function jobFilePath(runId) {
  return path.join(JOBS_DIR, `${runId}.json`);
}

export function isProcessAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeJobFile(runId, payload) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.writeFileSync(jobFilePath(runId), JSON.stringify(payload), 'utf8');
}

export function readJobFile(runId) {
  return JSON.parse(fs.readFileSync(jobFilePath(runId), 'utf8'));
}

export function cleanupJobFiles(runId) {
  for (const p of [pidFilePath(runId), jobFilePath(runId)]) {
    try { fs.unlinkSync(p); } catch (_) {}
  }
}

export function spawnRecordedRunWorker(runId) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const child = spawn(process.execPath, [WORKER_PATH, String(runId)], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
    cwd: path.join(__dirname, '../..'),
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(pidFilePath(runId), String(child.pid), 'utf8');
  return child.pid;
}

export function killRecordedRunWorker(runId) {
  try {
    const pid = Number(fs.readFileSync(pidFilePath(runId), 'utf8').trim());
    if (isProcessAlive(pid)) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch (_) {}
  cleanupJobFiles(runId);
}

/**
 * 在独立进程中执行试跑，避免 dev 热重载中断 Playwright。
 */
export async function executeRecordedRunJob(runId) {
  const job = readJobFile(runId);
  const {
    userId,
    teamId = null,
    caseCatalogId = null,
    casePath: relPath,
    script,
    environmentId = null,
    environmentSnapshot = null,
    storageState = null,
  } = job;

  const updateRun = db.prepare(`
    UPDATE recorded_runs
    SET status = ?, exit_code = ?, finished_at = datetime('now', '+8 hours'),
        log_text = ?, result_dir = ?, screenshot_path = ?, video_path = ?, error_message = ?
    WHERE id = ? AND user_id = ?
  `);
  const markRunning = db.prepare(`
    UPDATE recorded_runs SET status = 'running', started_at = datetime('now', '+8 hours') WHERE id = ?
  `);

  const runningTask = { runId, child: null, children: new Set() };

  try {
    let envRow = null;
    if (environmentId) {
      envRow = db.prepare('SELECT * FROM execution_environments WHERE id = ?').get(Number(environmentId));
    } else if (environmentSnapshot) {
      envRow = snapshotToExecEnvRow(environmentSnapshot);
    }

    const caseId = caseCatalogId || db.prepare(
      'SELECT id FROM cases WHERE team_id = ? AND legacy_path = ? AND status = ?',
    ).get(teamId, relPath, 'active')?.id;

    if (!caseId) {
      throw new Error('用例记录不存在，请重新保存用例');
    }

    if (script && String(script).trim()) {
      const { writeScript } = await import('./caseWorkspace.js');
      writeScript(teamId, caseId, script);
    }

    markRunning.run(runId);
    console.log(`[RecordedRun] #${runId} CaseRunner case#${caseId}`);

    const resultRoot = path.join(RESULTS_DIR, 'recorded', String(runId));
    await fsPromises.mkdir(resultRoot, { recursive: true });

    const start = Date.now();
    const result = await runCase({
      teamId,
      caseId,
      environmentId,
      planEnvRow: envRow,
      runId: `recorded-${runId}`,
      caseRowId: '1',
      taskRef: runningTask,
      headed: true,
      chromiumOnly: true,
    });
    const duration = Date.now() - start;

    const fromResult = path.join(WORKSPACE_ROOT, 'test-results-1');
    const { copyArtifacts, findArtifacts } = await import('./executor.js');
    const caseRow = db.prepare('SELECT legacy_path, script_path FROM cases WHERE id = ?').get(caseId);
    const artifactPath = caseRow?.legacy_path || `${teamId}/${caseId}/${caseRow?.script_path || 'case.spec.ts'}`;
    await copyArtifacts(fromResult, resultRoot, artifactPath);
    const artifacts = await findArtifacts(resultRoot);
    const logText = `${result.stdout}\n${result.stderr}`.trim();
    await fsPromises.writeFile(path.join(resultRoot, 'log.txt'), logText, 'utf8');

    const relResultDir = path.relative(RESULTS_DIR, resultRoot).replace(/\\/g, '/');
    const relScreenshot = artifacts.screenshot
      ? path.relative(RESULTS_DIR, artifacts.screenshot).replace(/\\/g, '/')
      : null;
    const relVideo = artifacts.video
      ? path.relative(RESULTS_DIR, artifacts.video).replace(/\\/g, '/')
      : null;

    const passed = result.code === 0;
    updateRun.run(
      passed ? 'passed' : 'failed',
      result.code,
      logText.slice(-50000),
      relResultDir,
      relScreenshot,
      relVideo,
      passed ? null : (result.stderr || result.stdout || '用例执行失败').split('\n').slice(-8).join('\n').slice(0, 2000),
      runId,
      userId,
    );

    console.log(`[RecordedRun] #${runId} ${passed ? 'passed' : 'failed'} (${duration}ms, exit ${result.code})`);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[RecordedRun] #${runId} error:`, msg);
    updateRun.run(
      'failed',
      null,
      msg,
      null,
      null,
      null,
      msg.slice(0, 2000),
      runId,
      userId,
    );
  } finally {
    cleanupJobFiles(runId);
  }
}

export function waitForRecordedRunCompletion(runId, { intervalMs = 2000, timeoutMs = 30 * 60 * 1000 } = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const row = db.prepare('SELECT status FROM recorded_runs WHERE id = ?').get(runId);
      if (!row) {
        resolve();
        return;
      }
      if (row.status !== 'pending' && row.status !== 'running') {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        db.prepare(
          "UPDATE recorded_runs SET status = 'failed', finished_at = datetime('now', '+8 hours'), error_message = '试跑超时' WHERE id = ? AND status IN ('pending', 'running')",
        ).run(runId);
        killRecordedRunWorker(runId);
        resolve();
        return;
      }
      try {
        const pid = Number(fs.readFileSync(pidFilePath(runId), 'utf8').trim());
        if (!isProcessAlive(pid)) {
          const current = db.prepare('SELECT status FROM recorded_runs WHERE id = ?').get(runId);
          if (current?.status === 'pending' || current?.status === 'running') {
            db.prepare(
              "UPDATE recorded_runs SET status = 'failed', finished_at = datetime('now', '+8 hours'), error_message = '试跑进程异常退出' WHERE id = ?",
            ).run(runId);
          }
          cleanupJobFiles(runId);
          resolve();
          return;
        }
      } catch (_) {}
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
