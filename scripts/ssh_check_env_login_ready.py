#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"
env_id = os.environ.get("ENV_ID", "2")

script = r"""
import './src/loadEnv.js';
import { db } from './src/db/schema.js';
const r = db.prepare(`
  SELECT id, name, test_username, wps_company_name,
    CASE WHEN test_password IS NOT NULL AND length(trim(test_password))>0 THEN 1 ELSE 0 END AS has_pw
  FROM execution_environments WHERE id=?
`).get(Number(process.argv[1]));
const hasRun = Boolean(
  (process.env.UIAUTO_INTERNAL_LOGIN_PASSWORD && process.env.UIAUTO_INTERNAL_LOGIN_PASSWORD.trim()) ||
  (process.env.E2E_PASSWORD && process.env.E2E_PASSWORD.trim()) ||
  (process.env.WPS_AUTO_LOGIN_PASSWORD && process.env.WPS_AUTO_LOGIN_PASSWORD.trim())
);
const cookieUrl = Boolean(process.env.UIAUTO_COOKIE_LOGIN_URL && process.env.UIAUTO_COOKIE_LOGIN_URL.trim());
console.log(JSON.stringify({ env: r, server_login_secret: hasRun, cookie_login_url: cookieUrl }, null, 2));
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
cmd = f"export PATH=/home/kso/node/bin:$PATH\ncd {REMOTE}\nnode --input-type=module -e {repr(script)[1:-1]} {env_id}\n"
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode() or e.read().decode())
c.close()
