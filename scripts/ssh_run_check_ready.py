#!/usr/bin/env python3
import os
import pathlib
import sys
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"
env_id = sys.argv[1] if len(sys.argv) > 1 else "2"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
sftp = c.open_sftp()
local = pathlib.Path(__file__).resolve().parents[1] / "backend" / "scripts" / "check-env-login-ready.mjs"
sftp.put(str(local), f"{REMOTE}/scripts/check-env-login-ready.mjs")
sftp.close()
_, o, e = c.exec_command(
    f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node scripts/check-env-login-ready.mjs {env_id}",
    timeout=60,
)
sys.stdout.buffer.write(o.read())
sys.stderr.buffer.write(e.read())
c.close()
