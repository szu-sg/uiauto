#!/usr/bin/env python3
"""Find any service on deploy host that implements phone+company -> wps_sid."""
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")

cmds = [
    "find /home/kso/csr-quality/backend -maxdepth 2 -name '*.py' ! -path '*/.venv/*' 2>/dev/null",
    "grep -rln 'playwright\\|safe_verify\\|passkey' /home/kso/csr-quality/backend --include='*.py' 2>/dev/null | grep -v .venv",
    "grep -rln 'wps_sid' /home/kso --include='*.py' --include='*.js' --include='*.mjs' 2>/dev/null | grep -v node_modules | grep -v .venv | grep -v uiauto/backend/results | head -60",
    "grep -rln 'company_name' /home/kso/csr-quality /home/kso/doc_arrangement 2>/dev/null | grep -v node_modules | grep -v .venv | head -30",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
for cmd in cmds:
    print("\n===", cmd, "===\n")
    _, o, _ = c.exec_command(cmd, timeout=120)
    text = o.read().decode(errors="replace")
    print(text[:12000] if len(text) > 12000 else text or "(empty)")
c.close()
