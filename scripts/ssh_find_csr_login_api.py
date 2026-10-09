#!/usr/bin/env python3
"""Search deploy host for phone+company cookie login API (CSR / uiauto)."""
import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")

cmds = [
    "find /home/kso/csr-quality /home/kso/csr-checklist -name 'auth.py' 2>/dev/null",
    "grep -rn wps_sid /home/kso/csr-quality --include='*.py' 2>/dev/null | head -30",
    "grep -rn wps_sid /home/kso/csr-checklist --include='*.py' 2>/dev/null | head -30",
    "grep -rn 'phone\\|company\\|cookie\\|login' /home/kso/csr-quality --include='auth.py' 2>/dev/null | head -50",
    "grep -rn '@app\\|router\\|/api' /home/kso/csr-quality --include='*.py' 2>/dev/null | grep -i login | head -30",
    "grep -rn 'COOKIE_LOGIN\\|cookie_login\\|get_sid\\|wps_sid' /home/kso/csr-quality /home/kso/csr-checklist 2>/dev/null | grep -v node_modules | head -40",
]

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
    for cmd in cmds:
        print("\n===", cmd, "===\n")
        _, o, e = c.exec_command(cmd, timeout=120)
        out = o.read().decode(errors="replace")
        err = e.read().decode(errors="replace")
        text = out or err or "(empty)"
        if len(text) > 8000:
            text = text[:8000] + "\n...(truncated)"
        print(text)
    c.close()

if __name__ == "__main__":
    main()
