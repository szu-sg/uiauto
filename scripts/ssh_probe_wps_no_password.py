#!/usr/bin/env python3
"""Run probe-wps-login-no-password.mjs on deploy server."""
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
    f"test -f scripts/probe-wps-login-no-password.mjs || echo 'MISSING probe script — deploy first'\n"
    f"node scripts/probe-wps-login-no-password.mjs {env_id}\n"
)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
stdin, stdout, stderr = client.exec_command(cmd, timeout=120000)
# Upload script if missing
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
if "MISSING probe script" in out:
    import pathlib
    local = pathlib.Path(__file__).resolve().parents[1] / "backend" / "scripts" / "probe-wps-login-no-password.mjs"
    sftp = client.open_sftp()
    sftp.put(str(local), f"{REMOTE}/scripts/probe-wps-login-no-password.mjs")
    sftp.close()
    _, stdout, stderr = client.exec_command(cmd, timeout=120000)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")

sys.stdout.write(out)
if err.strip():
    sys.stderr.write(err)
client.close()
