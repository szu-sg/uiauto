import { Router } from 'express';
import { db } from '../db/schema.js';
import { executePlan, cancelRun, getRunningRunId } from '../services/executor.js';
import { validatePlanRecord } from '../services/planEnvironmentValidation.js';
import { notifyRunStarted, mentionIdsForCollaborationUser } from '../services/collaborationNotify.js';

export const router = Router();

router.get('/', (req, res) => {
  const planId = req.query.planId;
  const uid = req.user.id;
  const teamId = req.teamId;
  const subCounts = `
    (SELECT COUNT(DISTINCT case_path) FROM run_cases WHERE run_id = r.id) AS cases_count,
    (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id AND status = 'passed') AS passed_count,
    (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id) AS total_cases
  `;
  const userJoin = `
    u.real_name AS trigger_user_name,
    u.avatar AS trigger_user_avatar,
    u.email AS trigger_user_email,
    u.uid AS trigger_user_uid
  `;
  let rows;
  if (planId) {
    const own = db.prepare('SELECT 1 FROM plans WHERE id = ? AND team_id = ?').get(Number(planId), teamId);
    if (!own) return res.json([]);
    rows = db.prepare(
      `SELECT r.*, p.name AS plan_name, p.creator AS plan_creator, ${subCounts}, ${userJoin}
       FROM runs r
       LEFT JOIN plans p ON r.plan_id = p.id
       LEFT JOIN users u ON u.id = r.triggered_by_user_id
       WHERE r.plan_id = ? ORDER BY r.created_at DESC`
    ).all(Number(planId));
  } else {
    rows = db.prepare(
      `SELECT r.*, p.name AS plan_name, p.creator AS plan_creator, ${subCounts}, ${userJoin}
       FROM runs r
       INNER JOIN plans p ON r.plan_id = p.id
       LEFT JOIN users u ON u.id = r.triggered_by_user_id
       WHERE p.team_id = ? ORDER BY r.created_at DESC LIMIT 100`
    ).all(teamId);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { plan_id, environment_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(Number(plan_id), req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  if (plan.enabled === 0) return res.status(400).json({ error: '计划已停用，请先启用后再执行' });

  const envValidation = validatePlanRecord(req.teamId, plan);
  if (!envValidation.ready_to_execute) {
    return res.status(400).json({
      error: envValidation.error || '请先在计划中选择执行环境',
      validation: envValidation,
    });
  }

  let envId = plan.environment_id ?? null;
  if (environment_id !== undefined && environment_id !== null && environment_id !== '') {
    const eid = Number(environment_id);
    const ok = db.prepare(
      'SELECT 1 FROM execution_environments WHERE id = ? AND team_id = ?',
    ).get(eid, req.teamId);
    if (!ok) return res.status(400).json({ error: '执行环境不存在或无权使用' });
    envId = eid;
  }
  if (envValidation.needs_plan_environment && (envId == null || envId === '' || !Number.isFinite(Number(envId)))) {
    return res.status(400).json({ error: '请先在计划中选择执行环境' });
  }
  const r = db.prepare(
    "INSERT INTO runs (plan_id, status, triggered_by_user_id, environment_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))"
  ).run(plan_id, 'pending', req.user.id, envId);
  const runId = r.lastInsertRowid;
  executePlan(runId, plan);
  try {
    notifyRunStarted({
      runId,
      plan,
      triggeredUserId: req.user.id,
      mentionUserIds: mentionIdsForCollaborationUser(req.user.id),
    }).catch((e) => console.warn('[CollaborationNotify] notifyRunStarted 异常:', e?.message || e));
  } catch (e) {
    console.warn('[CollaborationNotify] notifyRunStarted 调用失败:', e?.message || e);
  }
  res.status(201).json({ id: runId, plan_id: Number(plan_id), status: 'pending' });
});

/** 服务/执行状态：当前是否有任务在跑、阶段与计划名（供前台或运维查看） */
router.get('/status', (req, res) => {
  const runId = getRunningRunId();
  if (runId == null) {
    return res.json({ running: false });
  }
  const row = db.prepare('SELECT id, status, progress_phase, plan_id FROM runs WHERE id = ?').get(runId);
  const plan = row ? db.prepare('SELECT name, team_id FROM plans WHERE id = ?').get(row.plan_id) : null;
  if (!plan || Number(plan.team_id) !== Number(req.teamId)) {
    return res.json({ running: false });
  }
  const phaseLabel = {
    installing: '正在安装 Playwright 依赖',
    running: '正在执行用例',
  }[row?.progress_phase] || row?.progress_phase || '正在执行用例';
  res.json({
    running: true,
    runId: row?.id,
    planName: plan.name ?? null,
    phase: row?.progress_phase ?? null,
    phaseLabel,
  });
});

function parseCaseMetadataJson(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  try {
    const o = JSON.parse(String(raw));
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch (_) {}
  return null;
}

function getCaseDisplayNameForPath(plan, casePath) {
  if (!plan) return fallbackCaseNameFromPath(casePath);
  try {
    const meta = parseCaseMetadataJson(plan.case_metadata_json);
    const names = plan.case_display_names_json ? JSON.parse(plan.case_display_names_json) : null;
    if (meta && meta[casePath] && meta[casePath].name) return meta[casePath].name;
    if (names && names[casePath]) return names[casePath];
  } catch (_) {}
  return fallbackCaseNameFromPath(casePath);
}

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Run not found' });
  const planOwn = db.prepare('SELECT 1 FROM plans WHERE id = ? AND team_id = ?').get(row.plan_id, req.teamId);
  if (!planOwn) return res.status(404).json({ error: 'Run not found' });
  const cases = db.prepare('SELECT * FROM run_cases WHERE run_id = ? ORDER BY id').all(row.id);
  const plan = db.prepare('SELECT name, case_display_names_json, case_metadata_json, run_browsers_json, creator FROM plans WHERE id = ?').get(row.plan_id);
  const triggerUser = row.triggered_by_user_id
    ? db.prepare('SELECT real_name, avatar, email, uid FROM users WHERE id = ?').get(row.triggered_by_user_id)
    : null;
  const planCaseMetadata = parseCaseMetadataJson(plan?.case_metadata_json) || {};
  const casesWithNames = cases.map((c) => ({
    ...c,
    case_display_name: getCaseDisplayNameForPath(plan, c.case_path),
    case_metadata: planCaseMetadata[c.case_path] || null,
  }));
  let run_browsers = null;
  if (plan && plan.run_browsers_json) {
    try {
      run_browsers = JSON.parse(plan.run_browsers_json);
    } catch (_) {}
  }
  res.json({
    ...row,
    cases: casesWithNames,
    plan_name: plan ? plan.name : null,
    plan_creator: plan?.creator ?? null,
    run_browsers: Array.isArray(run_browsers) ? run_browsers : null,
    trigger_user_name: triggerUser?.real_name ?? null,
    trigger_user_avatar: triggerUser?.avatar ?? null,
    trigger_user_email: triggerUser?.email ?? null,
    trigger_user_uid: triggerUser?.uid ?? null,
  });
});

router.get('/:id/cases', (req, res) => {
  const runId = Number(req.params.id);
  const run = db.prepare('SELECT plan_id FROM runs WHERE id = ?').get(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!db.prepare('SELECT 1 FROM plans WHERE id = ? AND team_id = ?').get(run.plan_id, req.teamId)) {
    return res.status(404).json({ error: 'Run not found' });
  }
  const rows = db.prepare('SELECT * FROM run_cases WHERE run_id = ? ORDER BY id').all(runId);
  res.json(rows);
});

function fallbackCaseNameFromPath(filePath) {
  if (!filePath) return '未命名用例';
  const base = filePath.split('/').pop() || filePath;
  return base.replace(/\.(spec|test)\.(ts|js|mjs)$/i, '') || base || '未命名用例';
}

router.get('/:runId/cases/:caseId', (req, res) => {
  const runId = Number(req.params.runId);
  const caseId = Number(req.params.caseId);
  const row = db.prepare('SELECT * FROM run_cases WHERE id = ? AND run_id = ?').get(caseId, runId);
  if (!row) return res.status(404).json({ error: 'Case not found' });
  const run = db.prepare('SELECT id, plan_id, status, started_at, finished_at, log_text FROM runs WHERE id = ?').get(runId);
  if (!run || !db.prepare('SELECT 1 FROM plans WHERE id = ? AND team_id = ?').get(run.plan_id, req.teamId)) {
    return res.status(404).json({ error: 'Case not found' });
  }
  const plan = run ? db.prepare('SELECT name, case_display_names_json, case_metadata_json FROM plans WHERE id = ?').get(run.plan_id) : null;
  let caseDisplayName = fallbackCaseNameFromPath(row.case_path);
  let caseMetadata = null;
  if (plan) {
    try {
      const meta = parseCaseMetadataJson(plan.case_metadata_json);
      const names = plan.case_display_names_json ? JSON.parse(plan.case_display_names_json) : null;
      if (meta && meta[row.case_path]) {
        caseMetadata = meta[row.case_path];
        if (caseMetadata.name) caseDisplayName = caseMetadata.name;
      } else if (names && names[row.case_path]) {
        caseDisplayName = names[row.case_path];
      }
    } catch (_) {}
  }
  let screenshots = [];
  if (row.screenshots_json) {
    try {
      const arr = JSON.parse(row.screenshots_json);
      if (Array.isArray(arr)) screenshots = arr;
    } catch (_) {}
  }
  res.json({
    ...row,
    plan_id: run ? run.plan_id : null,
    plan_name: plan ? plan.name : null,
    run_status: run ? run.status : null,
    run_log_text: run?.log_text ?? null,
    case_display_name: caseDisplayName,
    case_metadata: caseMetadata,
    screenshots,
  });
});

router.post('/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT r.id, r.status, r.plan_id FROM runs r WHERE r.id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Run not found' });
  if (!db.prepare('SELECT 1 FROM plans WHERE id = ? AND team_id = ?').get(row.plan_id, req.teamId)) {
    return res.status(404).json({ error: 'Run not found' });
  }
  if (row.status !== 'pending' && row.status !== 'running') {
    return res.status(400).json({ error: '只能取消排队中或运行中的任务' });
  }
  db.prepare("UPDATE runs SET status = 'cancelled', finished_at = datetime('now', '+8 hours'), log_text = ?, progress_phase = NULL WHERE id = ?")
    .run('用户手动停止', id);
  cancelRun(id);
  res.json({ id, status: 'cancelled' });
});

// Artifacts are served via express.static('/results') as /results/:runId/:caseId/:filename
