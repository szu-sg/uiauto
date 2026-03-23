import cron from 'node-cron';
import { db } from '../db/schema.js';
import { executePlan } from './executor.js';
import { notifyRunStarted } from './collaborationNotify.js';

const jobs = new Map();

function triggerRun(planId) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!plan || !plan.schedule_enabled) return;
  const r = db.prepare("INSERT INTO runs (plan_id, status, created_at) VALUES (?, ?, datetime('now', '+8 hours'))").run(planId, 'pending');
  const newRunId = r.lastInsertRowid;
  executePlan(newRunId, plan);
  try {
    const cases = JSON.parse(plan.cases_json || '[]');
    notifyRunStarted({
      runId: newRunId,
      planName: plan.name,
      caseCount: Array.isArray(cases) ? cases.length : 0,
      triggerLabel: '定时任务',
    });
  } catch (_) {}
  console.log('[Scheduler] 定时执行: 计划 #%s, 运行 #%s', planId, newRunId);
}

export function loadAll() {
  const rows = db.prepare("SELECT id, schedule_cron FROM plans WHERE schedule_enabled = 1 AND schedule_cron IS NOT NULL AND schedule_cron != ''").all();
  for (const row of rows) {
    try {
      const job = cron.schedule(row.schedule_cron, () => triggerRun(row.id));
      jobs.set(row.id, job);
      console.log('[Scheduler] 已安排: 计划 #%s cron=%s', row.id, row.schedule_cron);
    } catch (e) {
      console.error('[Scheduler] 计划 #%s cron 无效: %s', row.id, e.message);
    }
  }
}

export function update(planId, { schedule_enabled, schedule_cron }) {
  const existing = jobs.get(planId);
  if (existing) {
    existing.stop();
    jobs.delete(planId);
  }
  if (schedule_enabled && schedule_cron && schedule_cron.trim()) {
    try {
      const job = cron.schedule(schedule_cron.trim(), () => triggerRun(planId));
      jobs.set(planId, job);
      console.log('[Scheduler] 已更新: 计划 #%s cron=%s', planId, schedule_cron.trim());
    } catch (e) {
      console.error('[Scheduler] 计划 #%s cron 无效: %s', planId, e.message);
    }
  }
}
