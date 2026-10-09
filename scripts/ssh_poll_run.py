#!/usr/bin/env python3
import os
import sys
import time
import paramiko

run_id = sys.argv[1] if len(sys.argv) > 1 else "47"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

poll_js = f"""
export PATH=/home/kso/node/bin:$PATH
cd {REMOTE}
node --input-type=module -e "
import {{ db }} from './src/db/schema.js';
const runId = {run_id};
const run = db.prepare('SELECT id, status, plan_id, progress_phase FROM runs WHERE id=?').get(runId);
const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);
const failed = db.prepare(\\"SELECT case_path, substr(error_message,1,300) AS err FROM run_cases WHERE run_id=? AND status='failed' LIMIT 8\\").all(runId);
console.log(JSON.stringify({{ run, stats, failed }}, null, 2));
"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for i in range(8):
    _, stdout, stderr = client.exec_command(poll_js, timeout=90)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    print(out or err)
    if '"status": "completed"' in out or '"status": "failed"' in out:
        if '"status": "running"' not in out.split("run")[1][:80] if '"run"' in out else True:
            try:
                import json
                data = json.loads(out)
                if data.get("run", {}).get("status") in ("completed", "failed", "cancelled"):
                    break
            except Exception:
                pass
    status_line = out
    if '"status": "running"' in out or '"status": "pending"' in out:
        time.sleep(45)
    else:
        break
client.close()
