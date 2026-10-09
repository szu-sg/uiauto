#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")

cmds = [
    "grep -rn 'company_name\\|wps_company\\|test_username\\|cookie_login\\|COOKIE_LOGIN' /home/kso/csr-quality/backend --include='*.py' 2>/dev/null | grep -v .venv | head -50",
    "grep -rn 'phone\\|mobile\\|account' /home/kso/doc_arrangement --include='*.py' 2>/dev/null | grep -i login | head -30",
    "grep -rn 'wps_sid\\|cookie' /home/kso/csr-checklist 2>/dev/null | grep -v node_modules | head -30",
    "grep -rn 'UIAUTO\\|cookie.*login\\|login.*cookie' /home/kso/uiauto/backend --include='*.js' --include='*.mjs' 2>/dev/null | head -40",
    "ss -tlnp 2>/dev/null | grep -E '300[0-9]|800[0-9]|500[0-9]' | head -20",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
for cmd in cmds:
    print("\n===", cmd[:90], "===\n")
    _, o, e = c.exec_command(cmd, timeout=90)
    text = (o.read() or e.read()).decode(errors="replace")
    print(text[:7000] if len(text) > 7000 else text or "(empty)")
c.close()
