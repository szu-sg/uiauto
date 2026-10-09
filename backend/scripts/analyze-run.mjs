#!/usr/bin/env node
import '../src/loadEnv.js';
import { db } from '../src/db/schema.js';

const runId = Number(process.argv[2] || 47);
const run = db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
if (!run) {
  console.error('run not found');
  process.exit(1);
}
const plan = db.prepare('SELECT * FROM plans WHERE id=?').get(run.plan_id);
const env = run.environment_id
  ? db.prepare(
      'SELECT id,name,env_kind,base_url,test_username,wps_company_name,switchhosts_text FROM execution_environments WHERE id=?',
    ).get(run.environment_id)
  : null;
const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);
const failed = db.prepare(
  `SELECT case_path, status, substr(error_message,1,400) AS err, log_path FROM run_cases
   WHERE run_id=? AND status='failed' ORDER BY id LIMIT 12`,
).all(runId);
const passed = db.prepare(
  "SELECT COUNT(*) AS n FROM run_cases WHERE run_id=? AND status='passed'",
).get(runId)?.n ?? 0;

console.log(JSON.stringify({
  run: { id: run.id, status: run.status, environment_id: run.environment_id },
  plan: plan ? { id: plan.id, name: plan.name } : null,
  env: env ? {
    ...env,
    switchhosts_text: env.switchhosts_text ? `${String(env.switchhosts_text).slice(0, 80)}...` : null,
    has_password: !!db.prepare('SELECT test_password FROM execution_environments WHERE id=?').get(env.id)?.test_password,
  } : null,
  stats,
  passed,
  failedSample: failed,
}, null, 2));
