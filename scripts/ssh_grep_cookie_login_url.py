#!/usr/bin/env python3
import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("10.13.146.59", username="kso", password=os.environ.get("DEPLOY_PASSWORD", ""), timeout=30)
_, o, _ = c.exec_command(
    "grep -h UIAUTO_COOKIE_LOGIN_URL /home/kso/uiauto/backend/.env /home/kso/uiauto/backend/data/.env 2>/dev/null | sed 's/=.*/=<set>/'",
    timeout=30,
)
print(o.read().decode() or "(not configured)")
c.close()
