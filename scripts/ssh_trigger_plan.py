#!/usr/bin/env python3
"""POST /api/runs on server (same path as UI). Usage: DEPLOY_PASSWORD=... python scripts/ssh_trigger_plan.py [plan_id]"""
import os
import sys
import paramiko

plan_id = sys.argv[1] if len(sys.argv) > 1 else "7"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"
PORT = os.environ.get("DEPLOY_PORT", "3001")

remote_js = f"""
export PATH=/home/kso/node/bin:$PATH
cd {REMOTE}
node --input-type=module <<'NODE'
import './src/loadEnv.js';
import {{ db }} from './src/db/schema.js';
import {{ signToken }} from './src/middleware/auth.js';

const planId = {plan_id};
const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
if (!plan) {{ console.error('plan not found'); process.exit(1); }}
const member = db.prepare(
  'SELECT u.id, u.username, tm.team_id FROM users u INNER JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = ? LIMIT 1'
).get(plan.team_id);
if (!member) {{ console.error('no member'); process.exit(1); }}
const token = signToken({{ id: member.id, username: member.username, current_team_id: member.team_id }}, member.team_id);
const res = await fetch('http://127.0.0.1:{PORT}/api/runs', {{
  method: 'POST',
  headers: {{ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }},
  body: JSON.stringify({{ plan_id: planId }}),
}});
const text = await res.text();
console.log(res.status, text);
NODE
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(remote_js, timeout=120)
sys.stdout.buffer.write(stdout.read())
err = stderr.read().decode(errors="replace")
if err:
    print(err, file=sys.stderr)
client.close()
