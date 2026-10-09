#!/usr/bin/env python3
import os
import sys
import time
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="kso", password=PASSWORD, timeout=30)
_, o, e = c.exec_command(f"bash {REMOTE}/start.sh 2>&1", timeout=120)
sys.stdout.buffer.write(o.read())
sys.stderr.buffer.write(e.read())
time.sleep(3)
_, o2, _ = c.exec_command("ss -tlnp 2>/dev/null | grep 3001 || echo NO_LISTEN", timeout=20)
sys.stdout.buffer.write(b"\n" + o2.read())
c.close()
