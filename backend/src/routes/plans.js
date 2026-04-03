import { Router } from 'express';
import cronParser from 'cron-parser';
import { db } from '../db/schema.js';
import { update as updateSchedule } from '../services/scheduler.js';
import { getCaseDisplayNames, getCaseMetadata } from '../services/github.js';

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

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
});

router.post('/', async (req, res, next) => {
  try {
    const { name, repo_owner, repo_name, repo_branch, cases, case_metadata, creator, token } = req.body;
    if (!name || !repo_owner || !repo_name) {
      return res.status(400).json({ error: 'name, repo_owner, repo_name required' });
    }
    const casesArr = Array.isArray(cases) ? cases : [];
    const casesJson = JSON.stringify(casesArr);
    const creatorVal = creator != null ? String(creator).trim() || null : null;
    const stmt = db.prepare(
      'INSERT INTO plans (name, repo_owner, repo_name, repo_branch, cases_json, creator, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const r = stmt.run(name, repo_owner, repo_name, repo_branch || 'main', casesJson, creatorVal, req.user.id);
    const planId = r.lastInsertRowid;
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
        return res.status(201).json({ id: planId, name, repo_owner, repo_name, repo_branch: repo_branch || 'main', creator: creatorVal, cases: casesArr });
      }
      try {
        const names = await getCaseDisplayNames({
          owner: repo_owner,
          repo: repo_name,
          branch: repo_branch || 'main',
          paths: casesArr,
          token: token && String(token).trim() ? String(token).trim() : undefined,
        });
        const namesJson = JSON.stringify(names);
        db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(namesJson, planId);
      } catch (e) {
        console.warn('[Plans] 创建计划时拉取用例名失败，将使用兜底名:', e.message);
      }
    }
    res.status(201).json({ id: planId, name, repo_owner, repo_name, repo_branch: repo_branch || 'main', creator: creatorVal, cases: casesArr });
  } catch (e) {
    next(e);
  }
});

const RUN_BROWSERS_VALID = new Set(['chromium', 'chrome', 'msedge', 'firefox', 'webkit']);

/** 必须在 /:id 之前注册，否则 cron 会被当成 id */
router.get('/cron/next', (req, res) => {
  const cron = req.query.cron;
  const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 5));
  const nexts = getNextCronRuns(cron, count);
  res.json({ nexts: nexts.map((d) => d.toISOString()) });
});

/** 计划级金山协作通知：Webhook（对应群）、各事件开关（@ 对象由触发人 users.uid 自动决定） */
router.patch('/:id/notify', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
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

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Plan not found' });
  row.cases = JSON.parse(row.cases_json || '[]');
  try {
    row.case_display_names = row.case_display_names_json ? JSON.parse(row.case_display_names_json) : {};
  } catch (_) {
    row.case_display_names = {};
  }
  try {
    row.case_metadata = row.case_metadata_json ? JSON.parse(row.case_metadata_json) : null;
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
  res.json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const { name, repo_owner, repo_name, repo_branch, cases, creator, run_browsers } = req.body;
  const casesJson = Array.isArray(cases) ? JSON.stringify(cases) : plan.cases_json;
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
  db.prepare(
    'UPDATE plans SET name = ?, repo_owner = ?, repo_name = ?, repo_branch = ?, cases_json = ?, creator = ?, run_browsers_json = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : plan.name,
    repo_owner !== undefined ? repo_owner : plan.repo_owner,
    repo_name !== undefined ? repo_name : plan.repo_name,
    repo_branch !== undefined ? repo_branch : plan.repo_branch,
    casesJson,
    creatorVal,
    runBrowsersJson,
    id
  );
  res.json({ id, updated: true });
});

/** 从 GitHub 拉取用例显示名与元数据（含优先级、描述、创建时间、创建人）并写入数据库 */
router.post('/:id/refresh-case-names', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const cases = JSON.parse(plan.cases_json || '[]');
    if (cases.length === 0) {
      db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run('{}', id);
      db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run('{}', id);
      return res.json({});
    }
    const [names, metadata] = await Promise.all([
      getCaseDisplayNames({
        owner: plan.repo_owner,
        repo: plan.repo_name,
        branch: plan.repo_branch || 'main',
        paths: cases,
      }),
      getCaseMetadata({
        owner: plan.repo_owner,
        repo: plan.repo_name,
        branch: plan.repo_branch || 'main',
        paths: cases,
      }),
    ]);
    const namesJson = JSON.stringify(names);
    db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(namesJson, id);
    const metaJson = JSON.stringify(metadata);
    db.prepare('UPDATE plans SET case_metadata_json = ? WHERE id = ?').run(metaJson, id);
    res.json({ names, metadata });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/schedule', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const { schedule_enabled, schedule_cron } = req.body;
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
    if (updates.length) {
      values.push(id);
      db.prepare('UPDATE plans SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
    }
    const updated = db.prepare('SELECT schedule_enabled, schedule_cron FROM plans WHERE id = ?').get(id);
    updateSchedule(id, { schedule_enabled: !!updated.schedule_enabled, schedule_cron: updated.schedule_cron || null });
    res.json({ id, schedule_enabled: !!updated.schedule_enabled, schedule_cron: updated.schedule_cron || null });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
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
