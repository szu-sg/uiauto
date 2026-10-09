#!/usr/bin/env python3
"""On deploy host: env phone+company -> wps_sid -> aidocs home probe."""
import os
import sys
import paramiko

env_id = sys.argv[1] if len(sys.argv) > 1 else "2"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

node_cmd = rf"""
export PATH=/home/kso/node/bin:/usr/bin:/bin:$PATH
cd {REMOTE}
node scripts/debug-env-login.mjs {env_id}
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
except Exception as e:
    print("SSH failed:", e)
    print("Set DEPLOY_PASSWORD and retry, or run locally: cd backend && node scripts/debug-env-login.mjs", env_id)
    sys.exit(2)

# sync latest wpsAccountLogin + debug script
import pathlib
sftp = client.open_sftp()
for rel in [
    "src/services/wpsAccountLogin.js",
    "scripts/debug-env-login.mjs",
]:
    local = pathlib.Path(__file__).resolve().parents[1] / "backend" / rel
    remote = f"{REMOTE}/{rel}"
    if local.is_file():
        sftp.put(str(local), remote)
sftp.close()

_, stdout, stderr = client.exec_command(node_cmd, timeout=180000)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
if err.strip():
    sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
client.close()
ok = "全部步骤通过" in out or ("新建应用" in out and "wps_sid:" in out)
sys.exit(0 if ok else 1)
