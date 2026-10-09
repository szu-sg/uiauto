#!/usr/bin/env python3
import os
import sys
import paramiko

run_id = sys.argv[1] if len(sys.argv) > 1 else "47"
HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

cmds = [
    f"ls -la {REMOTE}/results/{run_id} 2>/dev/null | head -20",
    f"tail -c 4000 {REMOTE}/results/run-{run_id}/run.log 2>/dev/null",
    f"ls {REMOTE}/results/run-{run_id} 2>/dev/null",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print("===", cmd[:70])
    _, stdout, stderr = client.exec_command(cmd, timeout=60)
    print(stdout.read().decode(errors="replace"))
    err = stderr.read().decode(errors="replace")
    if err.strip():
        print("stderr:", err)
client.close()
