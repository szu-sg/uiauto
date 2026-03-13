import { Router } from 'express';
import { db } from '../db/schema.js';
import { update as updateSchedule } from '../services/scheduler.js';
import { getCaseDisplayNames } from '../services/github.js';

export const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM plans ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/', async (req, res, next) => {
  try {
    const { name, repo_owner, repo_name, repo_branch, cases, creator, token } = req.body;
    if (!name || !repo_owner || !repo_name) {
      return res.status(400).json({ error: 'name, repo_owner, repo_name required' });
    }
    const casesArr = Array.isArray(cases) ? cases : [];
    const casesJson = JSON.stringify(casesArr);
    const creatorVal = creator != null ? String(creator).trim() || null : null;
    const stmt = db.prepare(
      'INSERT INTO plans (name, repo_owner, repo_name, repo_branch, cases_json, creator) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const r = stmt.run(name, repo_owner, repo_name, repo_branch || 'main', casesJson, creatorVal);
    const planId = r.lastInsertRowid;
    if (casesArr.length > 0) {
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

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Plan not found' });
  row.cases = JSON.parse(row.cases_json || '[]');
  try {
    row.case_display_names = row.case_display_names_json ? JSON.parse(row.case_display_names_json) : {};
  } catch (_) {
    row.case_display_names = {};
  }
  res.json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const { name, repo_owner, repo_name, repo_branch, cases, creator } = req.body;
  const casesJson = Array.isArray(cases) ? JSON.stringify(cases) : plan.cases_json;
  const creatorVal = creator !== undefined ? (String(creator).trim() || null) : (plan.creator ?? null);
  db.prepare(
    'UPDATE plans SET name = ?, repo_owner = ?, repo_name = ?, repo_branch = ?, cases_json = ?, creator = ? WHERE id = ?'
  ).run(
    name !== undefined ? name : plan.name,
    repo_owner !== undefined ? repo_owner : plan.repo_owner,
    repo_name !== undefined ? repo_name : plan.repo_name,
    repo_branch !== undefined ? repo_branch : plan.repo_branch,
    casesJson,
    creatorVal,
    id
  );
  res.json({ id, updated: true });
});

/** 从 GitHub 拉取用例显示名并写入数据库，供计划详情页快速读取 */
router.post('/:id/refresh-case-names', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const cases = JSON.parse(plan.cases_json || '[]');
    if (cases.length === 0) {
      db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run('{}', id);
      return res.json({});
    }
    const names = await getCaseDisplayNames({
      owner: plan.repo_owner,
      repo: plan.repo_name,
      branch: plan.repo_branch || 'main',
      paths: cases,
    });
    const json = JSON.stringify(names);
    db.prepare('UPDATE plans SET case_display_names_json = ? WHERE id = ?').run(json, id);
    res.json(names);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/schedule', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(id);
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
  const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(id);
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
