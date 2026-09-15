import PQueue from 'p-queue';
import { db } from '../db/schema.js';
import {
  writeJobFile,
  spawnRecordedRunWorker,
  killRecordedRunWorker,
  waitForRecordedRunCompletion,
  isProcessAlive,
  pidFilePath,
} from './recordedRunJob.js';
import fs from 'fs';

const concurrency = Math.max(1, Number(process.env.RUN_WORKER_CONCURRENCY || 2));
const queue = new PQueue({ concurrency });

function rowToRun(row) {
  return {
    id: row.id,
    case_catalog_id: row.case_catalog_id,
    case_path: row.case_path,
    case_name: row.case_name,
    environment_id: row.environment_id,
    status: row.status,
    exit_code: row.exit_code,
    started_at: row.started_at,
    finished_at: row.finished_at,
    log_text: row.log_text,
    result_dir: row.result_dir,
    screenshot_path: row.screenshot_path,
    video_path: row.video_path,
    screenshot_url: row.screenshot_path ? `/results/${row.screenshot_path}` : null,
    video_url: row.video_path ? `/results/${row.video_path}` : null,
    error_message: row.error_message,
    created_at: row.created_at,
  };
}

export function getRunningRecordedRunId() {
  const row = db.prepare(
    "SELECT id FROM recorded_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1",
  ).get();
  if (!row) return null;
  try {
    const pid = Number(fs.readFileSync(pidFilePath(row.id), 'utf8').trim());
    if (isProcessAlive(pid)) return row.id;
  } catch (_) {}
  return row.id;
}

export function cancelRecordedRun(runId) {
  const id = Number(runId);
  const row = db.prepare('SELECT status FROM recorded_runs WHERE id = ?').get(id);
  if (!row || (row.status !== 'running' && row.status !== 'pending')) return false;
  killRecordedRunWorker(id);
  return true;
}

/**
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number|null} opts.caseCatalogId
 * @param {string} opts.casePath - relative path under recorded-cases, e.g. recorded/foo.spec.ts
 * @param {string|null} opts.caseName
 * @param {string} opts.script - full playwright script content
 * @param {number|null} [opts.environmentId]
 * @param {object|null} [opts.environmentSnapshot] - 用例自带环境快照
 * @param {object|null} [opts.storageState] - 录制时同步的 Playwright storageState
 */
export function enqueueRecordedRun(opts) {
  const {
    userId,
    teamId = null,
    caseCatalogId = null,
    casePath,
    caseName = null,
    script,
    environmentId = null,
    environmentSnapshot = null,
    storageState = null,
  } = opts;

  const relPath = String(casePath || '').trim().replace(/^\/+/, '');
  if (!relPath) throw new Error('casePath 必填');
  if (!script || !String(script).trim()) throw new Error('script 必填');

  if (environmentId) {
    const envRow = db.prepare(
      'SELECT id FROM execution_environments WHERE id = ? AND (team_id = ? OR team_id IS NULL)',
    ).get(Number(environmentId), teamId);
    if (!envRow) throw new Error('执行环境不存在');
  }

  const insert = db.prepare(`
    INSERT INTO recorded_runs (
      user_id, team_id, case_catalog_id, case_path, case_name, environment_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  const r = insert.run(
    userId,
    teamId,
    caseCatalogId,
    relPath,
    caseName,
    environmentId ? Number(environmentId) : null,
  );
  const runId = Number(r.lastInsertRowid);

  writeJobFile(runId, {
    userId,
    teamId,
    caseCatalogId,
    casePath: relPath,
    caseName,
    script,
    environmentId: environmentId ? Number(environmentId) : null,
    environmentSnapshot: environmentSnapshot && typeof environmentSnapshot === 'object'
      ? environmentSnapshot
      : null,
    storageState: storageState && typeof storageState === 'object' ? storageState : null,
  });

  queue.add(async () => {
    try {
      spawnRecordedRunWorker(runId);
      await waitForRecordedRunCompletion(runId);
    } catch (err) {
      console.error(`[RecordedRun] #${runId} 调度失败:`, err?.message || err);
      db.prepare(
        "UPDATE recorded_runs SET status = 'failed', finished_at = datetime('now', '+8 hours'), error_message = ? WHERE id = ? AND status IN ('pending', 'running')",
      ).run(String(err?.message || err).slice(0, 2000), runId);
      killRecordedRunWorker(runId);
    }
  });

  return runId;
}

export function listRecordedRuns(teamId, { caseCatalogId, limit = 50 } = {}) {
  let sql = 'SELECT * FROM recorded_runs WHERE team_id = ?';
  const params = [Number(teamId)];
  if (caseCatalogId) {
    sql += ' AND case_catalog_id = ?';
    params.push(Number(caseCatalogId));
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 200));
  return db.prepare(sql).all(...params).map(rowToRun);
}

export function getRecordedRun(teamId, runId) {
  const row = db.prepare(
    'SELECT * FROM recorded_runs WHERE id = ? AND team_id = ?',
  ).get(Number(runId), Number(teamId));
  return row ? rowToRun(row) : null;
}
