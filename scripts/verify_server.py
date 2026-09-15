#!/usr/bin/env python3
"""Post-deploy smoke test: local HTTP + remote JWT via SSH.

Usage:
  $env:DEPLOY_PASSWORD='1234'; python scripts/verify_server.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto")
PORT = int(os.environ.get("DEPLOY_PORT", "3001"))
NODE_BIN = os.environ.get("DEPLOY_NODE_BIN", "/home/kso/node/bin/node")
BASE = f"http://{HOST}:{PORT}"


def http_get(path: str, token: str | None = None) -> tuple[int, str]:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def http_post(path: str, body: dict, token: str) -> tuple[int, str]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def ssh_exec(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


REMOTE_NODE_SCRIPT = r"""
import { db } from './src/db/schema.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJwtSecret() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^JWT_SECRET=(.+)$/);
    if (m) return m[1].trim();
  }
  return 'uiauto-dev-secret-change-in-production';
}

const user = db.prepare('SELECT id, username FROM users ORDER BY id LIMIT 1').get();
if (!user) {
  console.log(JSON.stringify({ ok: false, error: 'no users in DB' }));
  process.exit(0);
}

let team = db.prepare(`
  SELECT t.id, t.name, tm.role
  FROM teams t
  INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
  ORDER BY t.id LIMIT 1
`).get(user.id);

if (!team) {
  const label = '验证团队';
  const slug = `verify-${user.id}`;
  const r = db.prepare('INSERT INTO teams (name, slug, created_by) VALUES (?, ?, ?)').run(label, slug, user.id);
  const teamId = r.lastInsertRowid;
  db.prepare('INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)').run(teamId, user.id, 'owner', user.id);
  team = { id: teamId, name: label, role: 'owner' };
}

const secret = loadJwtSecret();
const token = jwt.sign({ sub: user.id, username: user.username, current_team_id: team.id }, secret, { expiresIn: '1h' });

const stats = {
  teams: db.prepare('SELECT COUNT(*) AS n FROM teams').get().n,
  members: db.prepare('SELECT COUNT(*) AS n FROM team_members').get().n,
  cases_active: db.prepare(
    "SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND status = 'active'",
  ).get(team.id)?.n ?? 0,
  catalog_platform: db.prepare(
    "SELECT COUNT(*) AS n FROM case_catalog WHERE team_id = ? AND repo_owner = 'uiauto' AND repo_name = 'recorded'",
  ).get(team.id)?.n ?? 0,
  plans_with_team: db.prepare('SELECT COUNT(*) AS n FROM plans WHERE team_id IS NOT NULL').get().n,
};

console.log(JSON.stringify({ ok: true, user_id: user.id, team, token, stats }));
"""


def main() -> int:
    if not PASSWORD:
        print("Set DEPLOY_PASSWORD")
        return 1

    failures: list[str] = []
    print(f"[verify] HTTP checks on {BASE}")

    status, out = http_get("/api/auth/bootstrap")
    if status != 200:
        failures.append(f"bootstrap HTTP {status}")
    else:
        try:
            boot = json.loads(out)
            if not boot.get("oauthEnabled") or boot.get("authDisabled"):
                failures.append(f"SSO bootstrap unexpected: {boot}")
            else:
                print("[ok] SSO: oauthEnabled=true, authDisabled=false")
        except json.JSONDecodeError:
            failures.append(f"bootstrap not JSON: {out[:200]}")

    status, _ = http_get("/api/cases")
    if status != 401:
        failures.append(f"/api/cases without token should 401, got {status}")
    else:
        print("[ok] /api/cases requires auth (401)")

    status, _ = http_post("/api/cases/import/zip", {}, "dummy")
    if status not in (401, 403):
        failures.append(f"/api/cases/import/zip should require auth, got {status}")
    else:
        print("[ok] /api/cases/import/zip route exists (auth required)")

    status, out = http_get("/api/auth/login-url")
    if status != 200:
        failures.append(f"login-url HTTP {status}")
    else:
        try:
            login = json.loads(out)
            oauth_url = login.get("url", "")
            if HOST not in oauth_url:
                failures.append(f"login url missing host: {oauth_url[:120]}")
            else:
                print(f"[ok] login-url contains {HOST}")
        except json.JSONDecodeError:
            failures.append(f"login-url not JSON: {out[:200]}")

    print(f"[verify] SSH token on {HOST}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    remote_script = f"{REMOTE_DIR}/backend/_verify_token.mjs"
    with sftp.open(remote_script, "w") as f:
        f.write(REMOTE_NODE_SCRIPT)
    sftp.close()

    code, out, err = ssh_exec(client, f"cd {REMOTE_DIR}/backend && {NODE_BIN} _verify_token.mjs")
    ssh_exec(client, f"rm -f {remote_script}")
    client.close()

    if code != 0:
        failures.append(f"token script failed: {err or out}")
        print_failures(failures)
        return 1

    try:
        tok_data = json.loads(out.strip().split("\n")[-1])
    except json.JSONDecodeError:
        failures.append(f"token script output: {out[:300]}")
        print_failures(failures)
        return 1

    if not tok_data.get("ok"):
        failures.append(tok_data.get("error", "token script error"))
        print_failures(failures)
        return 1

    stats = tok_data.get("stats", {})
    print(
        f"[ok] DB teams={stats.get('teams')} members={stats.get('members')} "
        f"cases(active)={stats.get('cases_active')} catalog(platform)={stats.get('catalog_platform')} "
        f"plans(team_id)={stats.get('plans_with_team')}"
    )

    token = tok_data["token"]
    team_id = tok_data["team"]["id"]

    status, out = http_get("/api/teams", token)
    if status != 200:
        failures.append(f"GET /api/teams HTTP {status}: {out[:200]}")
    else:
        teams_resp = json.loads(out)
        if teams_resp.get("current_team_id") != team_id:
            failures.append(f"teams current_team_id mismatch: {teams_resp}")
        else:
            print(f"[ok] GET /api/teams current_team_id={team_id} teams={len(teams_resp.get('teams') or [])}")

    status, out = http_get("/api/cases", token)
    if status != 200:
        failures.append(f"GET /api/cases HTTP {status}: {out[:200]}")
    else:
        cases = json.loads(out)
        if not isinstance(cases, list):
            failures.append(f"/api/cases not list: {out[:200]}")
        else:
            print(f"[ok] GET /api/cases -> {len(cases)} items (team scope)")
            if len(cases) < 5:
                failures.append(f"cases count unexpectedly low: {len(cases)}")

    platform = [c for c in cases if c.get("repo_owner") == "uiauto" and c.get("repo_name") == "recorded"]
    env_id = None
    status_env, out_env = http_get("/api/environments", token)
    if status_env == 200:
        try:
            envs = json.loads(out_env)
            if isinstance(envs, list) and envs:
                env_id = envs[0].get("id")
        except json.JSONDecodeError:
            pass

    plan_body = {
        "name": f"冒烟验证-{team_id}",
        "plan_type": "ui_auto",
        "case_ids": [platform[0]["id"]] if platform else [],
        "cases": [platform[0]["path"]] if platform else [],
    }
    if env_id is not None:
        plan_body["environment_id"] = env_id
    status, out = http_post("/api/plans", plan_body, token)
    if status not in (200, 201):
        failures.append(f"POST /api/plans HTTP {status}: {out[:300]}")
    else:
        plan = json.loads(out)
        if not plan.get("id"):
            failures.append(f"POST /api/plans no id: {out[:300]}")
        else:
            print(f"[ok] POST /api/plans id={plan['id']} cases={len(plan.get('cases') or [])}")
            if platform:
                status2, out2 = http_get(f"/api/plans/{plan['id']}", token)
                if status2 != 200:
                    failures.append(f"GET plan HTTP {status2}")
                else:
                    detail = json.loads(out2)
                    ids = detail.get("case_ids") or []
                    if ids and ids[0] == platform[0]["id"]:
                        print(f"[ok] plan case_ids=[{ids[0]}] matches catalog")
                    else:
                        failures.append(f"plan case_ids mismatch: {detail.get('case_ids')}")

    print()
    if failures:
        print_failures(failures)
        return 1

    print("[verify] All checks passed.")
    print(f"Manual: open {BASE}/ -> WPS login -> 顶栏团队 -> 用例库 -> 计划选例")
    return 0


def print_failures(failures: list[str]) -> None:
    print("[verify] FAILED:")
    for f in failures:
        print(f"  - {f}")


if __name__ == "__main__":
    sys.exit(main())
