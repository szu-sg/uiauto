#!/usr/bin/env python3
"""Read-only: check env #2 fields and server.log for WPS login chain."""
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

node_script = r"""
import './src/loadEnv.js';
import { db } from './src/db/schema.js';
const env = db.prepare(
  `SELECT id, name, test_username, test_password, wps_company_name,
   CASE WHEN test_password IS NOT NULL AND length(test_password)>0 THEN 1 ELSE 0 END AS has_pw,
   CASE WHEN switchhosts_text IS NOT NULL AND length(trim(switchhosts_text))>0 THEN 1 ELSE 0 END AS has_sh
   FROM execution_environments WHERE id=2`
).get();
const hasWpsSidEnv = !!(process.env.WPS_SID && String(process.env.WPS_SID).trim());
console.log(JSON.stringify({ env, hasWpsSidInProcessEnv: hasWpsSidEnv }, null, 2));
"""

cmd = (
    f"export PATH=/home/kso/node/bin:$PATH\n"
    f"cd {REMOTE}\n"
    f"node --input-type=module -e {repr(node_script)[1:-1]}\n"
    f"grep 'WPS 账号' /home/kso/uiauto/server.log 2>/dev/null | tail -5\n"
    f"grep 'WPS 账号 API' /home/kso/uiauto/server.log 2>/dev/null | tail -5\n"
    f"grep 'passkey\\|未找到公司' /home/kso/uiauto/server.log 2>/dev/null | tail -5\n"
    f"grep '已用仓库内 Playwright 生成 auth' /home/kso/uiauto/server.log 2>/dev/null | tail -2\n"
)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(cmd, timeout=90)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
print(out)
if err.strip():
    print("stderr:", err[:2000])
