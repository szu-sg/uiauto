import { Router } from 'express';
import { db } from '../db/schema.js';
import { executePlan, cancelRun } from '../services/executor.js';

export const router = Router();

router.get('/', (req, res) => {
  const planId = req.query.planId;
  let rows;
  if (planId) {
    rows = db.prepare(
      `SELECT r.*, p.name AS plan_name,
        (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id) AS cases_count
       FROM runs r LEFT JOIN plans p ON r.plan_id = p.id WHERE r.plan_id = ? ORDER BY r.created_at DESC`
    ).all(Number(planId));
  } else {
    rows = db.prepare(
      `SELECT r.*, p.name AS plan_name,
        (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id) AS cases_count
       FROM runs r LEFT JOIN plans p ON r.plan_id = p.id ORDER BY r.created_at DESC LIMIT 100`
    ).all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(plan_id));
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const r = db.prepare('INSERT INTO runs (plan_id, status) VALUES (?, ?)').run(plan_id, 'pending');
  const runId = r.lastInsertRowid;
  executePlan(runId, plan);
  res.status(201).json({ id: runId, plan_id: Number(plan_id), status: 'pending' });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Run not found' });
  const cases = db.prepare('SELECT * FROM run_cases WHERE run_id = ? ORDER BY id').all(row.id);
  const plan = db.prepare('SELECT name FROM plans WHERE id = ?').get(row.plan_id);
  res.json({ ...row, cases, plan_name: plan ? plan.name : null });
});

router.get('/:id/cases', (req, res) => {
  const rows = db.prepare('SELECT * FROM run_cases WHERE run_id = ? ORDER BY id').all(Number(req.params.id));
  res.json(rows);
});

router.get('/:runId/cases/:caseId', (req, res) => {
  const runId = Number(req.params.runId);
  const caseId = Number(req.params.caseId);
  const row = db.prepare('SELECT * FROM run_cases WHERE id = ? AND run_id = ?').get(caseId, runId);
  if (!row) return res.status(404).json({ error: 'Case not found' });
  const run = db.prepare('SELECT id, plan_id, status, started_at, finished_at FROM runs WHERE id = ?').get(runId);
  const plan = run ? db.prepare('SELECT name FROM plans WHERE id = ?').get(run.plan_id) : null;
  res.json({
    ...row,
    plan_id: run ? run.plan_id : null,
    plan_name: plan ? plan.name : null,
    run_status: run ? run.status : null,
  });
});

router.post('/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, status FROM runs WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Run not found' });
  if (row.status !== 'pending' && row.status !== 'running') {
    return res.status(400).json({ error: '只能取消排队中或运行中的任务' });
  }
  db.prepare('UPDATE runs SET status = \'cancelled\', finished_at = datetime(\'now\'), log_text = ? WHERE id = ?')
    .run('用户手动停止', id);
  cancelRun(id);
  res.json({ id, status: 'cancelled' });
});

// Artifacts are served via express.static('/results') as /results/:runId/:caseId/:filename
