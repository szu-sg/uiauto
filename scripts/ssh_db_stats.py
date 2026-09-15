#!/usr/bin/env python3
import os
import paramiko

HOST = "10.13.146.59"
USER = "kso"
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = "/home/kso/uiauto/backend"

script = r"""
export PATH=/home/kso/node/bin:$PATH
cd REMOTE_PLACEHOLDER
node --input-type=module -e "
import { db } from './src/db/schema.js';
const cases = db.prepare(\"SELECT COUNT(*) AS n FROM cases WHERE status='active'\").get().n;
const plans = db.prepare('SELECT COUNT(*) AS n FROM plans').get().n;
const teams = db.prepare('SELECT id, name FROM teams').all();
const sample = db.prepare(\"SELECT id, team_id, name, source FROM cases ORDER BY id DESC LIMIT 15\").all();
console.log(JSON.stringify({ cases, plans, teams, sample }, null, 2));
"
""".replace("REMOTE_PLACEHOLDER", REMOTE)

cmds = [
    "ls -la /home/kso/uiauto/backend/data/uiauto.db* 2>/dev/null | head -15",
    "find /home/kso/uiauto/backend/data/cases -maxdepth 3 -type d 2>/dev/null | head -25",
    "find /home/kso/uiauto/backend/data/recorded-cases -name '*.spec.*' 2>/dev/null | head -15",
    script,
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print("---", cmd.split("\n")[0][:80])
    _, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("stderr:", err.rstrip())
client.close()
