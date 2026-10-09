#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = "/home/kso/uiauto/backend/data"
keys = ["WPS_AUTO_LOGIN_PASSWORD", "E2E_PASSWORD", "WPS_SID", "E2E_USERNAME"]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("10.13.146.59", username="kso", password=PASSWORD, timeout=30)
for f in ["run.env", ".env"]:
    path = f"{REMOTE}/{f}"
    cmd = f"test -f {path} && grep -E '^({'|'.join(keys)})=' {path} | sed 's/=.*/=<set>/' || echo '{f}: missing or no keys'"
    _, stdout, _ = client.exec_command(cmd, timeout=30)
    print(stdout.read().decode(errors="replace").strip())
client.close()
