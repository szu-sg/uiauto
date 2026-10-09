#!/usr/bin/env python3
import os
import sys
import paramiko

plan_id = sys.argv[1] if len(sys.argv) > 1 else "7"
run_id = sys.argv[2] if len(sys.argv) > 2 else ""
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = "/home/kso/uiauto/backend"

if run_id:
    rid = run_id
    extra = f"const runId = {rid};"
else:
    extra = f"const runId = db.prepare('SELECT id FROM runs WHERE plan_id={plan_id} ORDER BY id DESC LIMIT 1').get().id;"

script = (
    "export PATH=/home/kso/node/bin:/usr/bin:/bin\n"
    f"cd {REMOTE}\n"
    "node --input-type=module -e \"\n"
    "import { db } from './src/db/schema.js';\n"
    f"{extra}\n"
    "const run = db.prepare('SELECT id, status, plan_id, progress_phase FROM runs WHERE id=?').get(runId);\n"
    "const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);\n"
    "const total = db.prepare('SELECT COUNT(*) AS n FROM run_cases WHERE run_id=?').get(runId).n;\n"
    "const failed = db.prepare(\\\"SELECT case_path, substr(error_message,1,160) AS err FROM run_cases WHERE run_id=? AND status='failed' LIMIT 15\\\").all(runId);\n"
    "console.log(JSON.stringify({ run, total, stats, failed }, null, 2));\n"
    "\"\n"
)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
_, o, e = c.exec_command(script, timeout=90)
sys.stdout.buffer.write(o.read())
sys.stderr.buffer.write(e.read())
c.close()
