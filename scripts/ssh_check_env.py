#!/usr/bin/env python3
import paramiko

HOST = "10.13.146.59"
USER = "kso"
import os

PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")

cmds = [
    "grep -E '^(HOST|PORT|SKIP_PLAYWRIGHT|UIAUTO_PUBLIC)' /home/kso/uiauto/backend/.env 2>/dev/null | head -10",
    "sqlite3 /home/kso/uiauto/backend/data/uiauto.db \"SELECT COUNT(*) FROM execution_environments;\"",
    "sqlite3 /home/kso/uiauto/backend/data/uiauto.db \"SELECT id, user_id, team_id, name FROM execution_environments ORDER BY id DESC LIMIT 10;\"",
    "tail -8 /home/kso/uiauto/server.log",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
for cmd in cmds:
    print("---", cmd)
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("stderr:", err.rstrip())
client.close()
