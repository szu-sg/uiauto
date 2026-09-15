import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { db } from '../db/schema.js';
import {
  materializeCaseForRun,
} from './caseService.js';
import { WORKSPACE_ROOT } from './caseWorkspace.js';
import {
  runSingleCaseInRepo,
  copyArtifacts,
  findArtifacts,
  runningTask,
} from './executor.js';
import { resolveExecutionEnvironment, snapshotToExecEnvRow } from './resolveEnvironment.js';
import { caseNeedsPlanEnvironment, loadPlanCases } from './planEnvironmentValidation.js';
import { notifyRunFinished, mentionIdsForRun } from './collaborationNotify.js';
import PQueue from 'p-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '../../results');
const RUN_CONCURRENCY = Math.max(1, parseInt(process.env.RUN_CONCURRENCY, 10) || 3);

function parseCaseIds(plan) {
  try {
    const ids = JSON.parse(plan.case_ids_json || '[]');
    if (Array.isArray(ids) && ids.length > 0) {
      return ids.map(Number).filter((n) => n > 0);
    }
  } catch (_) {}
  return [];
}

/** 执行环境行：用例绑定环境 / 快照优先，否则计划环境（登录在 executor 侧：有录制上下文则优先 storageState） */
function resolveEnvironmentForCase(caseRow, planEnvRow, runEnvId) {
  const plan = runEnvId != null && runEnvId !== ''
    ? { environment_id: runEnvId }
    : (planEnvRow?.id != null ? { environment_id: planEnvRow.id } : { environment_id: null });
  const resolved = resolveExecutionEnvironment({ caseRow, plan, overrideEnvId: null });
  if (resolved.envId) {
    return db.prepare('SELECT * FROM execution_environments WHERE id = ?').get(resolved.envId);
  }
  if (resolved.snapshot) {
    return snapshotToExecEnvRow(resolved.snapshot);
  }
  return planEnvRow;
}

function resolveLegacyPathToCaseId(teamId, legacyPath) {
  const row = db.prepare(
    "SELECT id FROM cases WHERE team_id = ? AND legacy_path = ? AND status = 'active'",
  ).get(Number(teamId), legacyPath);
  return row?.id || null;
}

/**
 * 执行单条平台用例（试跑 / 计划共用）
 */
export async function runCase({
  teamId,
  caseId,
  environmentId = null,
  planEnvRow = null,
  runId = '0',
  caseRowId = '0',
  taskRef = runningTask,
  browser = 'chromium',
  headed = false,
  chromiumOnly = true,
}) {
  const { row, relPath, storageState } = materializeCaseForRun(teamId, caseId);
  const execEnvRow = resolveEnvironmentForCase(row, planEnvRow, environmentId);
  return runSingleCaseInRepo(WORKSPACE_ROOT, relPath, execEnvRow, {
    runId,
    caseRowId,
    taskRef,
    browser,
    headed,
    chromiumOnly,
    storageState,
    forceDeps: false,
  });
}

/**
 * 计划执行：仅走 cases 工作区，不 git clone
 */
export async function runPlanCases(runId, plan) {
  const setRunStatus = db.prepare(
    "UPDATE runs SET status = ?, started_at = COALESCE(started_at, datetime('now', '+8 hours')), finished_at = datetime('now', '+8 hours'), log_text = ?, progress_phase = NULL WHERE id = ?",
  );
  const updateRun = db.prepare(
    "UPDATE runs SET status = 'running', started_at = datetime('now', '+8 hours') WHERE id = ?",
  );
  const updateProgress = db.prepare('UPDATE runs SET progress_phase = ? WHERE id = ?');
  const updateCase = db.prepare(`
    UPDATE run_cases SET status = ?, duration_ms = ?, error_message = ?, screenshot_path = ?, video_path = ?, trace_path = ?, log_path = ?, screenshots_json = ?
    WHERE id = ?
  `);
  const insertCase = db.prepare(`
    INSERT INTO run_cases (run_id, case_path, browser, status) VALUES (?, ?, ?, 'pending')
  `);

  const id = Number(runId);
  const teamId = plan.team_id;

  const sendFinish = (status, extra = {}) => {
    try {
      let passed;
      let total;
      if (status === 'done') {
        passed = db.prepare('SELECT COUNT(*) AS n FROM run_cases WHERE run_id = ? AND status = ?').get(runId, 'passed')?.n ?? 0;
        total = db.prepare('SELECT COUNT(*) AS n FROM run_cases WHERE run_id = ?').get(runId)?.n ?? 0;
      }
      notifyRunFinished({
        runId,
        plan,
        status,
        passed,
        total,
        mentionUserIds: mentionIdsForRun(runId, plan),
        ...extra,
      }).catch((e) => console.warn('[CaseRunner] notifyRunFinished:', e?.message || e));
    } catch (_) {}
  };

  try {
    const existing = db.prepare('SELECT status FROM runs WHERE id = ?').get(id);
    if (existing?.status === 'cancelled') return;

    const runMeta = db.prepare('SELECT environment_id FROM runs WHERE id = ?').get(id);
    const effEnvId = runMeta?.environment_id ?? plan.environment_id;
    const planEnvRow = effEnvId != null && effEnvId !== ''
      ? db.prepare('SELECT * FROM execution_environments WHERE id = ?').get(Number(effEnvId))
      : null;

    let caseIds = parseCaseIds(plan);
    const casePathEntries = [];

    if (caseIds.length > 0) {
      for (const cid of caseIds) {
        try {
          const { relPath } = materializeCaseForRun(teamId, cid);
          casePathEntries.push({ caseId: cid, casePath: relPath });
        } catch (matErr) {
          const msg = matErr?.message || String(matErr);
          casePathEntries.push({
            caseId: cid,
            casePath: `cases/${cid}/case.spec.ts`,
            materializeError: msg,
          });
        }
      }
    } else {
      const legacyPaths = JSON.parse(plan.cases_json || '[]');
      if (!Array.isArray(legacyPaths) || legacyPaths.length === 0) {
        setRunStatus.run('failed', '计划无用例，请从用例库选择用例', runId);
        sendFinish('failed', { errorHint: '计划无用例' });
        return;
      }
      for (const p of legacyPaths) {
        const cid = resolveLegacyPathToCaseId(teamId, p);
        if (!cid) {
          setRunStatus.run('failed', `用例「${p}」未在团队用例库中，请重新选择`, runId);
          sendFinish('failed', { errorHint: '计划含无效用例' });
          return;
        }
        const { relPath } = materializeCaseForRun(teamId, cid);
        casePathEntries.push({ caseId: cid, casePath: relPath });
      }
    }

    const allCaseIds = casePathEntries.map((e) => e.caseId);
    const needsPlanEnv = loadPlanCases(teamId, allCaseIds).some(caseNeedsPlanEnvironment);
    if (needsPlanEnv && !planEnvRow) {
      const msg = '计划含通用用例，请先绑定执行环境';
      setRunStatus.run('failed', msg, runId);
      sendFinish('failed', { errorHint: msg });
      return;
    }

    let browsers = ['chromium'];
    try {
      const parsed = JSON.parse(plan.run_browsers_json || '[]');
      if (Array.isArray(parsed) && parsed.length) {
        browsers = parsed.map((b) => String(b).toLowerCase()).filter(Boolean);
      }
    } catch (_) {}

    const tasks = [];
    for (const entry of casePathEntries) {
      for (const browser of browsers) {
        insertCase.run(runId, entry.casePath, browser);
        tasks.push({
          ...entry,
          browser,
          materializeError: entry.materializeError || null,
          caseRowId: db.prepare('SELECT last_insert_rowid()').pluck().get(),
        });
      }
    }

    updateRun.run(runId);
    runningTask.runId = id;
    runningTask.child = null;
    runningTask.children.clear();

    const runCasesDir = path.join(RESULTS_DIR, String(runId));
    await fs.mkdir(runCasesDir, { recursive: true });
    updateProgress.run('running', runId);

    const logChunks = [];
    const runQueue = new PQueue({ concurrency: RUN_CONCURRENCY });
    const rel = (p) => (p ? path.relative(RESULTS_DIR, p).replace(/\\/g, '/') : null);

    await Promise.all(tasks.map((task) => runQueue.add(async () => {
      if (db.prepare('SELECT status FROM runs WHERE id = ?').get(id)?.status === 'cancelled') return;

      const { casePath, caseRowId, caseId, browser, materializeError } = task;
      const caseResultDir = path.join(runCasesDir, String(caseRowId));
      try {
        await fs.mkdir(caseResultDir, { recursive: true });
        if (materializeError) {
          updateCase.run('failed', null, materializeError, null, null, null, null, null, caseRowId);
          logChunks.push(`\n--- case#${caseId} (跳过) ---\n${materializeError}\n`);
          return;
        }
        const start = Date.now();
        const result = await runCase({
          teamId,
          caseId,
          environmentId: effEnvId,
          planEnvRow,
          runId,
          caseRowId,
          taskRef: runningTask,
          browser: task.browser || 'chromium',
          headed: false,
        });
        const duration = Date.now() - start;
        logChunks.push(`\n--- ${casePath} [case#${caseId}] (exit ${result.code}) ---\n${result.stdout}\n${result.stderr}\n`);

        const fromResult = path.join(WORKSPACE_ROOT, `test-results-${caseRowId}`);
        await copyArtifacts(fromResult, caseResultDir, casePath);
        const artifacts = await findArtifacts(caseResultDir);
        const logPath = path.join(caseResultDir, 'log.txt');
        await fs.writeFile(logPath, `${result.stdout}\n${result.stderr}`, 'utf8');
        const screenshotsJson = artifacts.screenshots.length
          ? JSON.stringify(artifacts.screenshots.map((p) => rel(p)).filter(Boolean))
          : null;
        updateCase.run(
          result.code === 0 ? 'passed' : 'failed',
          duration,
          result.code !== 0 ? result.stderr.slice(-500) : null,
          rel(artifacts.screenshot),
          rel(artifacts.video),
          rel(artifacts.trace),
          rel(logPath),
          screenshotsJson,
          caseRowId,
        );
      } catch (taskErr) {
        const msg = taskErr?.message || String(taskErr);
        logChunks.push(`\n--- ${casePath} (执行异常) ---\n${msg}\n`);
        updateCase.run('failed', null, msg, null, null, null, null, null, caseRowId);
      }
    })));

    const logAcc = logChunks.join('');
    runningTask.runId = null;
    runningTask.child = null;
    runningTask.children.clear();
    updateProgress.run(null, runId);

    const runLogPath = path.join(runCasesDir, 'run.log');
    await fs.writeFile(runLogPath, logAcc, 'utf8');
    if (db.prepare('SELECT status FROM runs WHERE id = ?').get(id)?.status === 'cancelled') {
      setRunStatus.run('cancelled', '用户手动停止', runId);
      sendFinish('cancelled');
      return;
    }
    db.prepare(
      "UPDATE runs SET status = 'done', finished_at = datetime('now', '+8 hours'), result_dir = ?, log_text = ?, progress_phase = NULL WHERE id = ?",
    ).run(path.relative(RESULTS_DIR, runCasesDir).replace(/\\/g, '/'), logAcc.slice(-2000), runId);
    sendFinish('done');
  } catch (err) {
    runningTask.runId = null;
    runningTask.child = null;
    runningTask.children.clear();
    try { updateProgress.run(null, runId); } catch (_) {}
    const msg = err?.message || String(err);
    console.error('[CaseRunner] runId=%s error:', runId, msg);
    setRunStatus.run('failed', `执行失败: ${msg}`, runId);
    sendFinish('failed', { errorHint: msg });
  }
}
