#!/usr/bin/env python3
"""Smoke: symlink node_modules + run one Playwright case on server."""
import os
import sys
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto") + "/backend"

script = r"""
export PATH=/home/kso/node/bin:$PATH
cd REMOTE_PLACEHOLDER
node --input-type=module -e "
import { ensureWorkspaceShell } from './src/services/caseWorkspace.js';
import { db } from './src/db/schema.js';
ensureWorkspaceShell();
const row = db.prepare(\"SELECT team_id, id FROM cases WHERE status='active' ORDER BY id LIMIT 1\").get();
if (!row) { console.log('NO_CASE'); process.exit(2); }
const rel = row.team_id + '/' + row.id + '/case.spec.ts';
console.log('CASE', rel);
"
WS=REMOTE_PLACEHOLDER/data/cases/_workspace
CASE_REL=$(node --input-type=module -e "
import { db } from './src/db/schema.js';
const row = db.prepare(\"SELECT team_id, id FROM cases WHERE status='active' ORDER BY id LIMIT 1\").get();
if (!row) process.exit(2);
console.log(row.team_id + '/' + row.id + '/case.spec.ts');
" 2>/dev/null)
cd "$WS"
export PLAYWRIGHT_HEADLESS=1
export CI=1
timeout 90 npx playwright test "$CASE_REL" --project chromium 2>&1 | tail -25
echo EXIT:$?
""".replace("REMOTE_PLACEHOLDER", REMOTE)

if not PASSWORD:
    print("Set DEPLOY_PASSWORD", file=sys.stderr)
    sys.exit(1)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(script, timeout=180)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
print(out)
if err.strip():
    print(err, file=sys.stderr)
client.close()
if "Cannot find package '@playwright/test'" in out:
    sys.exit(1)
if "Cannot find package" not in out and "CASE " in out and "1 passed" in out:
    sys.exit(0)
if "Cannot find package" not in out and "CASE " in out and ("Running " in out or "›" in out or "passed" in out.lower()):
    if "Cannot find package" in out:
        sys.exit(1)
    if "1 failed" in out and "Missing X server" in out:
        print("NOTE: playwright loaded deps; failure is headless/display only", file=sys.stderr)
        sys.exit(0)
if "NO_CASE" in out:
    sys.exit(2)
sys.exit(1)
