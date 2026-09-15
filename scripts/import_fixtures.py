#!/usr/bin/env python3
"""将 fixtures 示例用例导入到本地或远程 UIAuto（需 SSO 登录后的团队上下文）。

通过 SSH 读取服务器 JWT（与 verify_server.py 相同），调用 REST API 导入 JSON / ZIP。

Usage:
  $env:DEPLOY_PASSWORD='你的密码'
  python scripts/build_fixture_zips.py
  python scripts/import_fixtures.py

可选环境变量:
  UIAuto_BASE=http://10.13.146.59:3001
  DEPLOY_HOST / DEPLOY_USER / DEPLOY_PASSWORD / DEPLOY_DIR
"""
from __future__ import annotations

import json
import os
import sys
import uuid
import urllib.error
import urllib.request
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "fixtures" / "sample-cases"
ZIPS = SAMPLES / "zips"

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto")
PORT = int(os.environ.get("DEPLOY_PORT", "3001"))
NODE_BIN = os.environ.get("DEPLOY_NODE_BIN", "/home/kso/node/bin/node")
BASE = os.environ.get("UIAUTO_BASE", f"http://{HOST}:{PORT}")

JSON_IMPORTS = [
    {
        "name": "【示例】Example 域名标题",
        "description": "fixtures portable-01，绝对 URL，适合计划环境试跑",
        "file": SAMPLES / "portable-01-example-domain" / "case.spec.ts",
        "portability": "portable",
        "module": "其他",
        "tags": ["示例", "冒烟"],
    },
    {
        "name": "【示例】Playwright 官网",
        "description": "fixtures portable-02",
        "file": SAMPLES / "portable-02-playwright-dev" / "case.spec.ts",
        "portability": "portable",
        "module": "其他",
        "tags": ["示例", "外网"],
    },
    {
        "name": "【示例】百度搜索页",
        "description": "fixtures portable-03，国内网络友好",
        "file": SAMPLES / "portable-03-baidu-search" / "case.spec.ts",
        "portability": "portable",
        "module": "其他",
        "tags": ["示例", "国内"],
    },
]

ZIP_IMPORTS = [
    ("【ZIP】Example 绑定包", ZIPS / "bundle-01-example-env.zip"),
    ("【ZIP】Example 通用", ZIPS / "portable-01-example-domain.zip"),
    ("【ZIP】Playwright 官网", ZIPS / "portable-02-playwright-dev.zip"),
    ("【ZIP】百度搜索", ZIPS / "portable-03-baidu-search.zip"),
]


REMOTE_TOKEN_SCRIPT = r"""
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
  console.log(JSON.stringify({ ok: false, error: 'no users' }));
  process.exit(0);
}

let team = db.prepare(`
  SELECT t.id, t.name, tm.role
  FROM teams t
  INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
  ORDER BY t.id LIMIT 1
`).get(user.id);

if (!team) {
  console.log(JSON.stringify({ ok: false, error: 'no team for user' }));
  process.exit(0);
}

const secret = loadJwtSecret();
const token = jwt.sign(
  { sub: user.id, username: user.username, current_team_id: team.id },
  secret,
  { expiresIn: '1h' },
);
console.log(JSON.stringify({ ok: true, token, team_id: team.id, user_id: user.id }));
"""


def http_json(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"error": raw[:500]}


def http_multipart_zip(path: str, token: str, zip_path: Path, name: str) -> tuple[int, dict]:
    """Python 构造 multipart/form-data，兼容 multer。"""
    boundary = f"----UIAutoImport{uuid.uuid4().hex}"
    file_bytes = zip_path.read_bytes()
    filename = zip_path.name
    parts: list[bytes] = []

    def add_field(field_name: str, value: str) -> None:
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{field_name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8"),
        )

    def add_file(field_name: str, fname: str, content: bytes) -> None:
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{field_name}"; filename="{fname}"\r\n'
                f"Content-Type: application/zip\r\n\r\n"
            ).encode("utf-8"),
        )
        parts.append(content)
        parts.append(b"\r\n")

    add_file("file", filename, file_bytes)
    add_field("name", name)
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)

    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"error": raw[:500]}


def fetch_token() -> str:
    if not PASSWORD:
        print("请设置 DEPLOY_PASSWORD（与 deploy_server.py 相同）")
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = client.open_sftp()
    remote = f"{REMOTE_DIR}/backend/_import_fixtures_token.mjs"
    with sftp.open(remote, "w") as f:
        f.write(REMOTE_TOKEN_SCRIPT)
    sftp.close()
    _, stdout, stderr = client.exec_command(
        f"cd {REMOTE_DIR}/backend && {NODE_BIN} _import_fixtures_token.mjs"
    )
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    client.exec_command(f"rm -f {remote}")
    client.close()
    if err.strip():
        print(err.strip())
    line = out.strip().split("\n")[-1]
    data = json.loads(line)
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "token failed"))
    print(f"[import] team_id={data.get('team_id')} user_id={data.get('user_id')}")
    return data["token"]


def main() -> int:
    if not ZIPS.exists():
        print("[import] 未找到 zips/，先运行: python scripts/build_fixture_zips.py")
        return 1

    token = fetch_token()
    created = []

    status, cases = http_json("GET", "/api/cases", token)
    existing_names = set()
    if status == 200 and isinstance(cases, list):
        existing_names = {str(c.get("name", "")).strip() for c in cases}

    for item in JSON_IMPORTS:
        if item["name"] in existing_names:
            print(f"[skip] JSON 已存在: {item['name']}")
            continue
        script = item["file"].read_text(encoding="utf-8")
        body = {
            "name": item["name"],
            "description": item["description"],
            "script": script,
            "source": "imported",
            "portability": item.get("portability", "portable"),
            "module": item.get("module", "其他"),
            "tags": item.get("tags", []),
        }
        status, data = http_json("POST", "/api/cases/import", token, body)
        if status not in (200, 201):
            print(f"[FAIL] JSON {item['name']}: {status} {data}")
            return 1
        print(f"[ok] JSON import id={data.get('id')} name={data.get('name')}")
        created.append(data)
        existing_names.add(item["name"])

    for name, zip_path in ZIP_IMPORTS:
        if name in existing_names:
            print(f"[skip] ZIP 已存在: {name}")
            continue
        if not zip_path.is_file():
            print(f"[skip] 缺少 {zip_path}")
            continue
        status, data = http_multipart_zip("/api/cases/import/zip", token, zip_path, name)
        if status not in (200, 201):
            print(f"[FAIL] ZIP {name}: {status} {data}")
            return 1
        print(f"[ok] ZIP import id={data.get('id')} name={data.get('name')}")
        created.append(data)
        existing_names.add(name)

    status, cases = http_json("GET", "/api/cases", token)
    if status == 200 and isinstance(cases, list):
        sample = [c for c in cases if str(c.get("name", "")).startswith("【")]
        print(f"[import] 用例库中带【示例】前缀: {len(sample)} 条（总计 {len(cases)} 条）")

    print(f"\n打开 {BASE}/ → 用例库 → 试跑 / 建计划选例")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
