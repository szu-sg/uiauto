#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")

cmds = [
    "grep -hE 'LOGIN|COOKIE|PASSWORD|wps_sid|account|E2E' /home/kso/uiauto/backend/.env /home/kso/uiauto/backend/data/.env /home/kso/uiauto/backend/data/run.env 2>/dev/null | sed 's/=.*/=<redacted>/'",
    "grep -rn 'http' /home/kso/csr-quality/backend/.env 2>/dev/null | sed 's/=.*/=<redacted>/' | head -30",
    "grep -rn 'login' /home/kso/csr-checklist 2>/dev/null | grep -v node_modules | head -25",
    "find /home/kso/csr-checklist -maxdepth 3 -type f \\( -name '*.py' -o -name '*.js' -o -name '*.ts' \\) 2>/dev/null | head -40",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
for cmd in cmds:
    print("\n===", cmd[:100], "===\n")
    _, o, _ = c.exec_command(cmd, timeout=90)
    text = o.read().decode(errors="replace")
    print(text[:8000] if len(text) > 8000 else text or "(empty)")
c.close()
