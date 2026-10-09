#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

cmd = f"""
export PATH=/home/kso/node/bin:$PATH
cd {REMOTE}
node --input-type=module -e "
import {{ db }} from './src/db/schema.js';
const row = db.prepare(\\"SELECT id, name FROM cases WHERE team_id=1 AND name LIKE 'SMK-001%' AND status='active' LIMIT 1\\").get();
const raw = db.prepare('SELECT metadata_json FROM cases WHERE id=?').get(row.id).metadata_json;
const meta = JSON.parse(raw);
const script = String(meta.script || '');
console.log(JSON.stringify({{ id: row.id, name: row.name, lines: script.split('\\\\n').length, tests: (script.match(/test\\\\(/g)||[]).length, full: script.includes('模块J') }}));
"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(cmd, timeout=60)
print(stdout.read().decode(errors="replace"))
print(stderr.read().decode(errors="replace"))
client.close()
