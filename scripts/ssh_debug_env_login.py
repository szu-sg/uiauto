#!/usr/bin/env python3
import os
import sys
import paramiko

env_id = sys.argv[1] if len(sys.argv) > 1 else "2"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

cmd = (
    f"export PATH=/home/kso/node/bin:/usr/bin:/bin:$PATH\n"
    f"cd {REMOTE}\n"
    f"node scripts/debug-env-login.mjs {env_id}\n"
)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(cmd, timeout=180000)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
if err.strip():
    sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
client.close()
sys.exit(0 if "全部步骤通过" in out else 1)
