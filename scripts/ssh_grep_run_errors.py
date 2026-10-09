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
    f"grep -h -E 'failed|Error:|timeout|Cannot find module|新建应用|exit code' {REMOTE}/results/{run_id}/*/log.txt 2>/dev/null | head -40",
    f"for f in {REMOTE}/results/{run_id}/256/log.txt {REMOTE}/results/{run_id}/264/log.txt {REMOTE}/results/{run_id}/300/log.txt; do echo '====' $f; tail -n 25 $f 2>/dev/null; done",
    f"test -f {REMOTE}/data/cases/_shared/smoke-knowledge-helpers.mjs && wc -l {REMOTE}/data/cases/_shared/smoke-knowledge-helpers.mjs || echo 'MISSING shared helpers'",
    f"test -f {REMOTE}/data/cases/_workspace/auth.json && echo 'auth.json exists' || echo 'NO auth.json in workspace'",
    f"tail -n 3 {REMOTE}/data/cases/_workspace/auth.json 2>/dev/null | head -1",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print("===", cmd[:90])
    _, stdout, stderr = client.exec_command(cmd, timeout=90)
    out = stdout.read().decode(errors="replace")
    if out.strip():
        print(out[:8000])
client.close()
