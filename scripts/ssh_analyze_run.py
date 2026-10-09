#!/usr/bin/env python3
"""Analyze run failures on server."""
import os
import sys
import json
import paramiko

run_id = sys.argv[1] if len(sys.argv) > 1 else "47"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

js = f"""
import './src/loadEnv.js';
import {{ db }} from './src/db/schema.js';
const runId = {run_id};
const run = db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
const plan = run ? db.prepare('SELECT * FROM plans WHERE id=?').get(run.plan_id) : null;
const env = run?.environment_id
  ? db.prepare('SELECT id,name,env_kind,base_url,test_username,wps_company_name FROM execution_environments WHERE id=?').get(run.environment_id)
  : null;
const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);
const failed = db.prepare(
  `SELECT rc.id, rc.case_path, rc.status, rc.error_message, rc.log_path, c.name
   FROM run_cases rc
   LEFT JOIN cases c ON c.team_id = ? AND rc.case_path LIKE c.team_id || '/' || c.id || '/%'
   WHERE rc.run_id=? AND rc.status='failed'
   ORDER BY rc.id LIMIT 15`
).all(plan?.team_id || 1, runId);
const errBuckets = db.prepare(
  `SELECT substr(error_message,1,120) AS head, COUNT(*) AS n
   FROM run_cases WHERE run_id=? AND status='failed' AND error_message IS NOT NULL AND error_message != ''
   GROUP BY head ORDER BY n DESC LIMIT 10`
).all(runId);
console.log(JSON.stringify({{ run: {{ id: run.id, status: run.status, log_text: run.log_text?.slice(0,500) }}, plan: plan ? {{ id: plan.id, name: plan.name }} : null, env, stats, errBuckets, failedSample: failed }}, null, 2));
"""

cmd = f"export PATH=/home/kso/node/bin:/usr/bin:/bin:$PATH\ncd {REMOTE}\nnode --input-type=module -e {json.dumps(js)}"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(cmd, timeout=120)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
print(out or err)
client.close()
