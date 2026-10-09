#!/usr/bin/env python3
import os
import sys
import paramiko

plan_id = sys.argv[1] if len(sys.argv) > 1 else "7"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

js = f"""
import {{ db }} from './src/db/schema.js';
const planId = {plan_id};
const run = db.prepare('SELECT id,status,created_at FROM runs WHERE plan_id=? ORDER BY id DESC LIMIT 1').get(planId);
const stats = run ? db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(run.id) : [];
console.log(JSON.stringify({{ run, stats }}));
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
_, o, _ = c.exec_command(f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node --input-type=module -e {repr(js)[1:-1]}", timeout=60)
sys.stdout.buffer.write(o.read())
c.close()
