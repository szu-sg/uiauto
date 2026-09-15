import { Router } from 'express';
import cronParser from 'cron-parser';
import { db } from '../db/schema.js';
import { update as updateSchedule } from '../services/scheduler.js';
import { resolveCaseIdsToPaths, buildCaseDisplayDataForPlan, buildPlanCaseItems } from '../services/caseService.js';
import { validatePlanRecord, buildPlanEnvironmentSummary } from '../services/planEnvironmentValidation.js';

/** 计算 cron 表达式下一次执行时间（本地时间），无效则返回 null */
function getNextCronRun(cronExpression) {
  if (!cronExpression || typeof cronExpression !== 'string' || !cronExpression.trim()) return null;
  try {
    const interval = cronParser.parseExpression(cronExpression.trim(), { currentDate: new Date() });
    return interval.next().toDate();
  } catch (_) {
    return null;
  }
}

/** 计算 cron 表达式接下来 N 次执行时间，无效则返回 [] */
function getNextCronRuns(cronExpression, count = 5) {
  if (!cronExpression || typeof cronExpression !== 'string' || !cronExpression.trim() || count < 1) return [];
  try {
    const interval = cronParser.parseExpression(cronExpression.trim(), { currentDate: new Date() });
    const dates = [];
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate());
    }
    return dates;
  } catch (_) {
    return [];
  }
}

export const router = Router();

/** case_metadata_json 可能为 null、合法 JSON null、或非对象，统一成可安全索引的对象 */
function parseCaseMetadataObject(raw) {
  if (raw == null || String(raw).trim() === '') return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return {};
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, e.name AS environment_name
    FROM plans p
    LEFT JOIN execution_environments e ON e.id = p.environment_id AND e.team_id = p.team_id
    WHERE p.team_id = ?
    ORDER BY p.created_at DESC
  `).all(req.teamId);
  res.json(rows);
});

router.post('/', async (req, res, next) => {
  try {
    const { name, plan_type, repo_owner, repo_name, repo_branch, cases, case_ids, case_metadata, creator, token, environment_id } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '计划名称必填' });
    }
    const typeVal = plan_type === 'fastbot' ? 'fastbot' : 'ui_auto';
    let owner = repo_owner != null ? String(repo_owner).trim() : '';
    let repo = repo_name != null ? String(repo_name).trim() : '';
    if (!owner && !repo) {
      owner = 'uiauto';
      repo = 'recorded';
    }
    let caseIdsJson = null;
    let casesArr = [];
    let eid = null;
    if (environment_id != null && environment_id !== '') {
      eid = Number(environment_id);
      const envOk = db.prepare(
        'SELECT 1 FROM execution_environments WHERE id = ? AND team_id = ?',
      ).get(eid, req.teamId);
      if (!envOk) return res.status(400).json({ error: '执行环境不存在或无权使用' });
    }
    if (Array.isArray(case_ids) && case_ids.length > 0) {
      const ids = case_ids.map(Number).filter((n) => n > 0);
      casesArr = resolveCaseIdsToPaths(req.teamId, ids);
      caseIdsJson = JSON.stringify(ids);
      owner = 'uiauto';
      repo = 'recorded';
    } else if (Array.isArray(cases)) {
      casesArr = cases;
    }
    const casesJson = JSON.stringify(casesArr);
    const creatorVal = creator != null && String(creator).trim()
      ? String(creator).trim()
      : (() => {
          const u = db.prepare('SELECT real_name, email, username FROM users WHERE id = ?').get(req.user.id);
          return (u?.real_name && String(u.real_name).trim())
            || (u?.email && String(u.email).trim())
            || (u?.username && String(u.username).trim())
            || null;
        })();
    const stmt = db.prepare(
      'INSERT INTO plans (name, repo_owner, repo_name, repo_branch, cases_json, case_ids_json, creator, user_id, team_id, plan_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const r = stmt.run(
      String(name).trim(),
      owner,
      repo,
      repo_branch || 'main',
      casesJson,
      caseIdsJson,
      creatorVal,
      req.user.id,
      req.teamId,
      typeVal,
    );
    const planId = r.lastInsertRowid;
    if (eid != null) {
      db.prepare('UPDATE plans SET environment_id = ? WHERE id = ?').run(eid, planId);
    }
    if (casesArr.length > 0) {
      if (case_metadata && typeof case_metadata === 'object') {
        const filtered = {};
        for (const p of casesArr) {
          if (case_metadata[p]) filtered[p] = case_metadata[p];
        }
        if (Object.keys(filtered).length) {
          db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run(JSON.stringify(filtered), planId);
          const namesOnly = {};
          for (const [path, meta] of Object.entries(filtered)) namesOnly[path] = meta.name || path;
          db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(JSON.stringify(namesOnly), planId);
        }
        return res.status(201).json({ id: planId, name: String(name).trim(), plan_type: typeVal, repo_owner: owner, repo_name: repo, repo_branch: repo_branch || 'main', creator: creatorVal, cases: casesArr });
      }
      try {
        const ids = caseIdsJson ? JSON.parse(caseIdsJson) : [];
        const { names, metadata: caseMeta } = buildCaseDisplayDataForPlan(req.teamId, ids, casesArr);
        if (Object.keys(names).length) {
          db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(JSON.stringify(names), planId);
        }
        if (Object.keys(caseMeta).length) {
          db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run(JSON.stringify(caseMeta), planId);
        }
      } catch (e) {
        console.warn('[Plans] 创建计划时同步用例名失败:', e.message);
      }
    }
    res.status(201).json({ id: planId, name: String(name).trim(), plan_type: typeVal, repo_owner: owner, repo_name: repo, repo_branch: repo_branch || 'main', creator: creatorVal, cases: casesArr });
  } catch (e) {
    next(e);
  }
});

const RUN_BROWSERS_VALID = new Set(['chromium', 'chrome', 'msedge', 'firefox', 'webkit']);

function patchPlanSchedule(teamId, planId, { schedule_enabled, schedule_cron, schedule_once }) {
  const id = Number(planId);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND team_id = ?').get(id, Number(teamId));
  if (!plan) return null;
  const updates = [];
  const values = [];
  if (schedule_enabled !== undefined) {
    updates.push('schedule_enabled = ?');
    values.push(schedule_enabled ? 1 : 0);
  }
  if (schedule_cron !== undefined) {
    updates.push('schedule_cron = ?');
    values.push(schedule_cron ? String(schedule_cron).trim() || null : null);
  }
  if (schedule_once !== undefined) {
    updates.push('schedule_once = ?');
    values.push(schedule_once ? 1 : 0);
  }
  if (updates.length) {
    values.push(id);
    db.prepare(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  const updated = db.prepare('SELECT schedule_enabled, schedule_cron, schedule_once FROM plans WHERE id = ?').get(id);
  updateSchedule(id, { schedule_enabled: !!updated.schedule_enabled, schedule_cron: updated.schedule_cron || null });
  return {
    id,
    schedule_enabled: !!updated.schedule_enabled,
    schedule_cron: updated.schedule_cron || null,
    schedule_once: !!updated.schedule_once,
  };
}

/** 必须在 /:id 之前注册，否则 cron 会被当成 id */
router.get('/cron/next', (req, res) => {
  const cron = req.query.cron;
  const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 5));
  const nexts = getNextCronRuns(cron, count);
  res.json({ nexts: nexts.map((d) => d.toISOString()) });
});

/** 批量设置测试计划定时调度 */
router.post('/schedule/batch', (req, res, next) => {
  try {
    const { plan_ids, schedule_enabled, schedule_cron, schedule_once } = req.body || {};
    const ids = Array.isArray(plan_ids) ? plan_ids.map(Number).filter((n) => n > 0) : [];
    if (!ids.length) return res.status(400).json({ error: 'plan_ids 必填' });
    if (
      schedule_enabled === undefined
      && schedule_cron === undefined
      && schedule_once === undefined
    ) {
      return res.status(400).json({ error: '请提供 schedule_enabled / schedule_cron / schedule_once' });
    }
    if (schedule_enabled) {
      const cron = schedule_cron != null ? String(schedule_cron).trim() : '';
      if (!cron) return res.status(400).json({ error: '启用定时需填写有效的 schedule_cron' });
    }
    const updated = [];
    const errors = [];
    for (const planId of ids) {
      const row = patchPlanSchedule(req.teamId, planId, {
        schedule_enabled,
        schedule_cron,
        schedule_once,
      });
      if (!row) errors.push({ id: planId, error: '计划不存在' });
      else updated.push(row);
    }
    res.json({ updated, errors });
  } catch (e) {
    next(e);
  }
});

/** 计划级金山协作通知：Webhook（对应群）、各事件开关（@ 对象由触发人 users.uid 自动决定） */
router.patch('/:id/notify', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { notify_webhook_url, notify_on_created, notify_on_success, notify_on_failure } = req.body || {};
  const updates = [];
  const values = [];

  if (notify_webhook_url !== undefined) {
    updates.push('notify_webhook_url = ?');
    values.push(notify_webhook_url ? String(notify_webhook_url).trim() : null);
  }
  if (notify_on_created !== undefined) {
    updates.push('notify_on_created = ?');
    values.push(notify_on_created ? 1 : 0);
  }
  if (notify_on_success !== undefined) {
    updates.push('notify_on_success = ?');
    values.push(notify_on_success ? 1 : 0);
  }
  if (notify_on_failure !== undefined) {
    updates.push('notify_on_failure = ?');
    values.push(notify_on_failure ? 1 : 0);
  }

  if (!updates.length) {
    return res.status(400).json({ error: '无有效字段' });
  }
  values.push(id);
  db.prepare('UPDATE plans SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
  const row = db.prepare(
    'SELECT notify_webhook_url, notify_on_created, notify_on_success, notify_on_failure FROM plans WHERE id = ?'
  ).get(id);
  res.json({ id, ...row });
});

router.get('/:id/environment-check', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(buildPlanEnvironmentSummary(req.teamId, plan));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(Number(req.params.id), req.teamId);
  if (!row) return res.status(404).json({ error: 'Plan not found' });
  row.cases = JSON.parse(row.cases_json || '[]');
  try {
    row.case_display_names = row.case_display_names_json ? JSON.parse(row.case_display_names_json) : {};
  } catch (_) {
    row.case_display_names = {};
  }
  try {
    const cm = parseCaseMetadataObject(row.case_metadata_json);
    row.case_metadata = Object.keys(cm).length ? cm : null;
  } catch (_) {
    row.case_metadata = null;
  }
  try {
    row.run_browsers = row.run_browsers_json ? JSON.parse(row.run_browsers_json) : null;
  } catch (_) {
    row.run_browsers = null;
  }
  if (row.schedule_cron && row.schedule_cron.trim()) {
    const next = getNextCronRun(row.schedule_cron);
    row.next_schedule_run = next ? next.toISOString() : null;
  } else {
    row.next_schedule_run = null;
  }
  try {
    row.case_ids = row.case_ids_json ? JSON.parse(row.case_ids_json) : [];
  } catch (_) {
    row.case_ids = [];
  }
  row.environment_summary = buildPlanEnvironmentSummary(req.teamId, row);
  row.plan_cases = buildPlanCaseItems(req.teamId, row);
  res.json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const { name, plan_type, repo_owner, repo_name, repo_branch, cases, case_ids, creator, run_browsers, environment_id, case_metadata } = req.body;
  let casesJson = Array.isArray(cases) ? JSON.stringify(cases) : plan.cases_json;
  let caseIdsJson = plan.case_ids_json;
  let owner = repo_owner !== undefined ? String(repo_owner).trim() : (plan.repo_owner || '');
  let repo = repo_name !== undefined ? String(repo_name).trim() : (plan.repo_name || '');
  let branch = repo_branch !== undefined ? (repo_branch || 'main') : (plan.repo_branch || 'main');
  if (Array.isArray(case_ids) && case_ids.length > 0) {
    const ids = case_ids.map(Number).filter((n) => n > 0);
    const paths = resolveCaseIdsToPaths(req.teamId, ids);
    casesJson = JSON.stringify(paths);
    caseIdsJson = JSON.stringify(ids);
    owner = 'uiauto';
    repo = 'recorded';
    branch = 'main';
  } else if (Array.isArray(cases)) {
    casesJson = JSON.stringify(cases);
  }
  const finalCases = JSON.parse(casesJson || '[]');
  const creatorVal = creator !== undefined ? (String(creator).trim() || null) : (plan.creator ?? null);
  let runBrowsersJson = plan.run_browsers_json;
  if (run_browsers !== undefined) {
    if (run_browsers === null || (Array.isArray(run_browsers) && run_browsers.length === 0)) {
      runBrowsersJson = null;
    } else if (Array.isArray(run_browsers)) {
      const valid = run_browsers.filter((b) => RUN_BROWSERS_VALID.has(String(b).toLowerCase()));
      runBrowsersJson = valid.length ? JSON.stringify(valid) : null;
    }
  }
  let envId = plan.environment_id ?? null;
  if (environment_id !== undefined) {
    if (environment_id === null || environment_id === '') {
      envId = null;
    } else {
      const eid = Number(environment_id);
      const ok = db.prepare(
        'SELECT 1 FROM execution_environments WHERE id = ? AND team_id = ?',
      ).get(eid, req.teamId);
      if (!ok) return res.status(400).json({ error: '执行环境不存在或无权使用' });
      envId = eid;
    }
  }

  let finalCaseIds = [];
  try {
    finalCaseIds = JSON.parse(caseIdsJson || '[]');
  } catch (_) {}
  const caseMetadataProvided =
    case_metadata != null && typeof case_metadata === 'object' && !Array.isArray(case_metadata);
  const casesProvided = Array.isArray(cases);

  const currentMeta = parseCaseMetadataObject(plan.case_metadata_json);
  if (caseMetadataProvided) {
    const allowed = new Set(finalCases);
    for (const [p, patch] of Object.entries(case_metadata)) {
      if (!allowed.has(p) || !patch || typeof patch !== 'object' || Array.isArray(patch)) continue;
      const merged = { ...(currentMeta[p] || {}), ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'reuse_scope')) {
        if (patch.reuse_scope === 'generic' || patch.reuse_scope === 'specific') {
          merged.reuse_scope = patch.reuse_scope;
        } else {
          delete merged.reuse_scope;
        }
      }
      currentMeta[p] = merged;
    }
  }

  /** 仅在有 case 列表变更或显式改 metadata 时写回，避免每次 PUT（浏览器/计划名/环境等）重写整列引发异常或丢数据 */
  let caseMetadataJson = plan.case_metadata_json ?? null;
  if (caseMetadataProvided || casesProvided) {
    const pruned = {};
    for (const p of finalCases) {
      if (Object.prototype.hasOwnProperty.call(currentMeta, p)) {
        const v = currentMeta[p];
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
          pruned[p] = v;
        }
      }
    }
    caseMetadataJson = JSON.stringify(pruned);
  }

  const typeVal = plan_type === 'fastbot' ? 'fastbot' : plan_type === 'ui_auto' ? 'ui_auto' : (plan.plan_type || 'ui_auto');

  db.prepare(
    'UPDATE plans SET name = ?, plan_type = ?, repo_owner = ?, repo_name = ?, repo_branch = ?, cases_json = ?, case_ids_json = ?, creator = ?, run_browsers_json = ?, environment_id = ?, case_metadata_json = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : plan.name,
    typeVal,
    owner,
    repo,
    branch,
    casesJson,
    caseIdsJson,
    creatorVal,
    runBrowsersJson,
    envId,
    caseMetadataJson,
    id
  );
  res.json({ id, updated: true });
});

/** 从 cases 表同步用例显示名与元数据 */
router.post('/:id/refresh-case-names', (req, res) => {
  try {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const cases = JSON.parse(plan.cases_json || '[]');
    let caseIds = [];
    try {
      caseIds = JSON.parse(plan.case_ids_json || '[]');
    } catch (_) {}
    if (cases.length === 0) {
      db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run('{}', id);
      db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run('{}', id);
      return res.json({});
    }
    const { names, metadata } = buildCaseDisplayDataForPlan(req.teamId, caseIds, cases);
    const prevMeta = parseCaseMetadataObject(plan.case_metadata_json);
    const mergedMeta = {};
    for (const path of cases) {
      const fresh = metadata[path] || {};
      mergedMeta[path] = { ...fresh };
      const prev = prevMeta[path];
      if (prev && (prev.reuse_scope === 'generic' || prev.reuse_scope === 'specific')) {
        mergedMeta[path].reuse_scope = prev.reuse_scope;
      }
    }
    db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(JSON.stringify(names), id);
    db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run(JSON.stringify(mergedMeta), id);
    res.json({ names, metadata: mergedMeta });
  } catch (e) {
    res.status(500).json({ error: e.message || '同步失败' });
  }
});

router.patch('/:id/schedule', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { schedule_enabled, schedule_cron, schedule_once } = req.body;
    const row = patchPlanSchedule(req.teamId, id, {
      schedule_enabled,
      schedule_cron,
      schedule_once,
    });
    if (!row) return res.status(404).json({ error: 'Plan not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/enabled', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const { enabled } = req.body || {};
  if (enabled === undefined) return res.status(400).json({ error: 'enabled 必填' });
  const val = enabled ? 1 : 0;
  db.prepare('UPDATE plans SET enabled = ? WHERE id = ?').run(val, id);
  res.json({ id, enabled: !!val });
});

router.post('/:id/copy', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const baseName = String(plan.name || '计划').trim() || '计划';
  const copyName = baseName.endsWith(' 副本') ? `${baseName} 2` : `${baseName} 副本`;
  const r = db.prepare(`
    INSERT INTO plans (
      name, repo_owner, repo_name, repo_branch, cases_json, case_ids_json, creator, user_id, team_id, plan_type,
      environment_id, case_metadata_json, case_display_names_json, run_browsers_json, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    copyName,
    plan.repo_owner,
    plan.repo_name,
    plan.repo_branch || 'main',
    plan.cases_json,
    plan.case_ids_json,
    plan.creator,
    req.user.id,
    req.teamId,
    plan.plan_type || 'ui_auto',
    plan.environment_id ?? null,
    plan.case_metadata_json,
    plan.case_display_names_json,
    plan.run_browsers_json,
  );
  res.status(201).json({ id: r.lastInsertRowid, name: copyName });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND team_id = ?').get(id, req.teamId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const runIds = db.prepare('SELECT id FROM runs WHERE plan_id = ?').all(id).map((r) => r.id);
  if (runIds.length > 0) {
    const placeholders = runIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM run_cases WHERE run_id IN (${placeholders})`).run(...runIds);
    db.prepare('DELETE FROM runs WHERE plan_id = ?').run(id);
  }
  db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  res.json({ deleted: true });
});
