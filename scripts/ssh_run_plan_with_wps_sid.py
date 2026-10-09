#!/usr/bin/env python3
"""Set server WPS_SID, sync executor, restart, trigger plan, poll stats."""
import os
import sys
import time
import json
import pathlib
import paramiko

WPS_SID = sys.argv[1] if len(sys.argv) > 1 else ""
PLAN_ID = sys.argv[2] if len(sys.argv) > 2 else "7"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto")
REMOTE = f"{REMOTE_DIR}/backend"
PORT = os.environ.get("DEPLOY_PORT", "3001")

if not WPS_SID or not PASSWORD:
    print("Usage: DEPLOY_PASSWORD=... python ssh_run_plan_with_wps_sid.py <wps_sid> [plan_id]")
    sys.exit(2)

def run(client, cmd, timeout=120):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    return (o.read() + e.read()).decode(errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

# sync executor
sftp = client.open_sftp()
local_exec = pathlib.Path(__file__).resolve().parents[1] / "backend" / "src" / "services" / "executor.js"
sftp.put(str(local_exec), f"{REMOTE}/src/services/executor.js")
sftp.close()

# WPS_SID in data/.env
env_path = f"{REMOTE}/data/.env"
run(client, f"test -f {env_path} || touch {env_path}")
run(
    client,
    f"grep -v '^WPS_SID=' {env_path} > {env_path}.tmp 2>/dev/null || true; "
    f"mv {env_path}.tmp {env_path} 2>/dev/null || true; "
    f"echo 'WPS_SID={WPS_SID}' >> {env_path}",
)

print(run(client, f"grep '^WPS_SID=' {env_path} | sed 's/=.*/=<set>/'"))

# restart backend
print(run(client, f"bash {REMOTE_DIR}/start.sh", timeout=180))
time.sleep(3)

# resolve plan name
plan_info = run(
    client,
    f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node --input-type=module -e \""
    f"import {{db}} from './src/db/schema.js';"
    f"const p=db.prepare('SELECT id,name,environment_id FROM plans WHERE id=?').get({PLAN_ID});"
    f"console.log(JSON.stringify(p));\"",
)
print("plan:", plan_info.strip())

trigger = run(
    client,
    f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node --input-type=module <<'NODE'\n"
    f"import './src/loadEnv.js';\n"
    f"import {{ db }} from './src/db/schema.js';\n"
    f"import {{ signToken }} from './src/middleware/auth.js';\n"
    f"const planId = {PLAN_ID};\n"
    f"const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);\n"
    f"if (!plan) {{ console.error('plan not found'); process.exit(1); }}\n"
    f"const member = db.prepare(\n"
    f"  'SELECT u.id, u.username, tm.team_id FROM users u INNER JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = ? LIMIT 1'\n"
    f").get(plan.team_id);\n"
    f"const token = signToken({{ id: member.id, username: member.username, current_team_id: member.team_id }}, member.team_id);\n"
    f"const res = await fetch('http://127.0.0.1:{PORT}/api/runs', {{\n"
    f"  method: 'POST',\n"
    f"  headers: {{ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }},\n"
    f"  body: JSON.stringify({{ plan_id: planId }}),\n"
    f"}});\n"
    f"const text = await res.text();\n"
    f"console.log(text);\n"
    f"NODE",
    timeout=60,
)
print("trigger:", trigger.strip())
try:
    run_id = json.loads(trigger.strip().split("\n")[-1])["id"]
except Exception:
    # try find id in response
    import re
    m = re.search(r'"id"\s*:\s*(\d+)', trigger)
    run_id = int(m.group(1)) if m else None
if not run_id:
    print("Could not parse run id")
    client.close()
    sys.exit(1)
print("run_id:", run_id)

poll_js = f"""
import {{ db }} from './src/db/schema.js';
const runId = {run_id};
const run = db.prepare('SELECT id, status, plan_id, progress_phase FROM runs WHERE id=?').get(runId);
const stats = db.prepare('SELECT status, COUNT(*) AS n FROM run_cases WHERE run_id=? GROUP BY status').all(runId);
const failed = db.prepare("SELECT case_path, substr(error_message,1,200) AS err FROM run_cases WHERE run_id=? AND status='failed' ORDER BY id LIMIT 12").all(runId);
console.log(JSON.stringify({{ run, stats, failed }}, null, 2));
"""

for i in range(40):
    out = run(
        client,
        f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node --input-type=module -e {repr(poll_js)[1:-1]}",
        timeout=90,
    )
    try:
        data = json.loads(out.strip().split("\n")[-1] if "\n" in out else out)
    except Exception:
        data = None
    if data:
        st = data.get("run", {}).get("status")
        print(f"--- poll {i+1} status={st} ---")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:8000])
        if st in ("completed", "failed", "cancelled"):
            break
    time.sleep(60)

client.close()
