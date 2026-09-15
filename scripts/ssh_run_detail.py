#!/usr/bin/env python3
"""Query run details on remote server. Usage: DEPLOY_PASSWORD=... python scripts/ssh_run_detail.py [run_id]"""
import os
import sys
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"
run_id = sys.argv[1] if len(sys.argv) > 1 else "39"

script = r"""
export PATH=/home/kso/node/bin:$PATH
cd REMOTE_PLACEHOLDER
node --input-type=module -e "
import { db } from './src/db/schema.js';
const runId = RUN_ID_PLACEHOLDER;
const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
const cases = db.prepare('SELECT id, case_path, status, duration_ms, error_message, screenshot_path, log_path, trace_path FROM run_cases WHERE run_id = ?').all(runId);
const plan = run ? db.prepare('SELECT id, name, environment_id, case_ids_json FROM plans WHERE id = ?').get(run.plan_id) : null;
let env = null;
if (plan?.environment_id) env = db.prepare('SELECT id, name, env_kind, base_url, test_username FROM environments WHERE id = ?').get(plan.environment_id);
console.log(JSON.stringify({ run, cases, plan, env }, null, 2));
"
""".replace("REMOTE_PLACEHOLDER", REMOTE).replace("RUN_ID_PLACEHOLDER", str(run_id))

cmds = [
    script,
    f"find {REMOTE}/results -maxdepth 3 -type f 2>/dev/null | grep -E 'run-{run_id}|/{run_id}/' | head -40",
    f"tail -c 8000 {REMOTE}/results/run-{run_id}/run.log 2>/dev/null || tail -c 8000 {REMOTE}/results/{run_id}/run.log 2>/dev/null || echo 'no run.log'",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print("===", cmd[:100], "...")
    _, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("stderr:", err.rstrip())
client.close()
