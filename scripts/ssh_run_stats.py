#!/usr/bin/env python3
import os
import sys
import paramiko

run_id = sys.argv[1] if len(sys.argv) > 1 else "44"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = "/home/kso/uiauto/backend"

script = (
    "export PATH=/home/kso/node/bin:/usr/bin:/bin\n"
    f"cd {REMOTE}\n"
    "node --input-type=module -e \"\n"
    "import { db } from './src/db/schema.js';\n"
    f"const runId = {run_id};\n"
    "const run = db.prepare('SELECT id, status, plan_id FROM runs WHERE id=?').get(runId);\n"
    "const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);\n"
    "const sample = db.prepare(\"SELECT status, substr(error_message,1,200) AS err, case_path FROM run_cases WHERE run_id=? AND status='failed' LIMIT 5\").all(runId);\n"
    "console.log(JSON.stringify({ run, stats, failedSample: sample }, null, 2));\n"
    "\"\n"
)
cmd = script
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(cmd, timeout=60)
print(stdout.read().decode(errors="replace"))
if stderr.read():
    print(stderr.read().decode(errors="replace"), file=sys.stderr)
client.close()
