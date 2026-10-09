#!/usr/bin/env python3
import os, sys, paramiko
plan_id = sys.argv[1] if len(sys.argv) > 1 else "7"
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = "/home/kso/uiauto/backend"
script = (
    f"export PATH=/home/kso/node/bin:$PATH; cd {REMOTE} && node --input-type=module -e \""
    "import { db } from './src/db/schema.js';"
    f"const rows=db.prepare('SELECT id,status,created_at FROM runs WHERE plan_id=? ORDER BY id DESC LIMIT 8').all({plan_id});"
    "console.log(JSON.stringify(rows,null,2));\""
)
c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("10.13.146.59",username="kso",password=PASSWORD,timeout=30)
_,o,_=c.exec_command(script,timeout=60)
sys.stdout.buffer.write(o.read());c.close()
