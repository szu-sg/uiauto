#!/usr/bin/env node
/**
 * 与 POST /api/runs 相同：插入 run 并 executePlan（供运维/调试，非旁路执行引擎）。
 * 用法: node scripts/trigger-plan-run.mjs [plan_id]
 */
import { db } from '../src/db/schema.js';
import { executePlan } from '../src/services/executor.js';
import { validatePlanRecord } from '../src/services/planEnvironmentValidation.js';

const planId = Number(process.argv[2] || process.env.PLAN_ID || 7);
const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
if (!plan) {
  console.error(`计划 #${planId} 不存在`);
  process.exit(1);
}
const validation = validatePlanRecord(plan.team_id, plan);
if (!validation.ready_to_execute) {
  console.error(validation.error || '计划未就绪');
  process.exit(1);
}
const owner = db.prepare(
  `SELECT user_id FROM team_members WHERE team_id = ? AND role = 'owner' LIMIT 1`,
).get(plan.team_id);
const triggerUser = owner?.user_id
  || db.prepare('SELECT user_id FROM team_members WHERE team_id = ? LIMIT 1').get(plan.team_id)?.user_id;
if (!triggerUser) {
  console.error('团队无成员');
  process.exit(1);
}
const envId = plan.environment_id ?? null;
const r = db.prepare(
  "INSERT INTO runs (plan_id, status, triggered_by_user_id, environment_id, created_at) VALUES (?, 'pending', ?, ?, datetime('now', '+8 hours'))",
).run(planId, triggerUser, envId);
const runId = r.lastInsertRowid;
executePlan(runId, plan);
console.log(`run #${runId} queued for plan #${planId}「${plan.name}」env=${envId}`);
