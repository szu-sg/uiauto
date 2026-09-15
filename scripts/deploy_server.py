#!/usr/bin/env python3
"""Deploy UIAuto to kso server (same host as CSR_Checklist).

Usage (PowerShell):
  $env:DEPLOY_PASSWORD='1234'; python scripts/deploy_server.py

Optional env:
  DEPLOY_HOST, DEPLOY_USER, DEPLOY_DIR, DEPLOY_PORT, SKIP_BUILD=1
"""
from __future__ import annotations

import os
import secrets
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "10.13.146.59")
USER = os.environ.get("DEPLOY_USER", "kso")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/home/kso/uiauto")
PORT = int(os.environ.get("DEPLOY_PORT", "3001"))
NODE_DIR = os.environ.get("DEPLOY_NODE_DIR", "/home/kso/node/bin")
NODE_BIN = f"{NODE_DIR}/node"

ROOT = Path(__file__).resolve().parents[1]

SKIP_NAMES = {
    "node_modules",
    ".git",
    ".cursor",
    ".env",
    ".env.local",
}
SKIP_PREFIXES = (
    "backend/data/",
    "backend/repos/",
    "backend/results/",
    "frontend/node_modules/",
    "backend/node_modules/",
)


def should_skip(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in SKIP_NAMES:
        return True
    if any(part in SKIP_NAMES for part in parts):
        return True
    norm = rel.replace("\\", "/")
    if any(norm.startswith(p) for p in SKIP_PREFIXES):
        return True
    if norm.endswith("uiauto.db") or norm.endswith(".db-wal") or norm.endswith(".db-shm"):
        return True
    return False


def create_archive() -> Path:
    fd, name = tempfile.mkstemp(suffix=".tar.gz")
    os.close(fd)
    archive = Path(name)
    with tarfile.open(archive, "w:gz") as tar:
        for path in ROOT.rglob("*"):
            rel = str(path.relative_to(ROOT))
            if should_skip(rel):
                continue
            tar.add(path, arcname=rel)
    return archive


def run_local_build() -> None:
    if os.environ.get("SKIP_BUILD") == "1":
        print("[deploy] SKIP_BUILD=1, using existing backend/public")
        return
    print("[deploy] Building frontend...")
    subprocess.run("npm run build", cwd=ROOT, check=True, shell=True)


def ssh_exec(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    print(f"[remote] {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return code, out, err


def ensure_remote_env(client: paramiko.SSHClient) -> None:
    env_path = f"{REMOTE_DIR}/backend/.env"
    _, out, _ = ssh_exec(client, f"test -f {env_path} && echo exists || echo missing")
    if "exists" in out:
        print("[deploy] backend/.env already exists, keeping it")
        return

    jwt = secrets.token_urlsafe(48)
    env_content = f"""# UIAuto production env (auto-created on first deploy)
HOST=0.0.0.0
PORT={PORT}
JWT_SECRET={jwt}

# WPS OAuth (same app as CSR quality)
WPS_APPID=854bb91c-5ef2-11f1-adfe-dee35356ca96
WPS_APPKEY=ckz7yJd0v5482wKteXqNVh6UQ93ZOmW1
WPS_REDIRECT_URI=http://{HOST}:{PORT}/

# Playwright: avoid sudo during test runs
SKIP_PLAYWRIGHT_DEPS=1

# Public URL for notifications / report links
UIAUTO_PUBLIC_BASE_URL=http://{HOST}:{PORT}
"""
    sftp = client.open_sftp()
    with sftp.open(env_path, "w") as f:
        f.write(env_content)
    sftp.close()
    print(f"[deploy] Created {env_path}")


def strip_dev_auth_flags(client: paramiko.SSHClient) -> None:
    """生产环境禁用 AUTH_DISABLED（backend/data/.env 会覆盖 backend/.env）。"""
    data_env = f"{REMOTE_DIR}/backend/data/.env"
    cmd = (
        f"test -f {data_env} && "
        f"sed -i '/^AUTH_DISABLED=/d' {data_env} && "
        f"echo '[deploy] stripped AUTH_DISABLED from backend/data/.env' || "
        f"echo '[deploy] no backend/data/.env'"
    )
    ssh_exec(client, cmd)


def fix_data_permissions(client: paramiko.SSHClient) -> None:
    data = f"{REMOTE_DIR}/backend/data"
    ssh_exec(
        client,
        f"mkdir -p {data} && "
        f"touch {data}/uiauto.db && "
        f"chmod -R u+rwX {data} && "
        f"chmod 664 {data}/uiauto.db 2>/dev/null || true",
    )


def write_start_script(client: paramiko.SSHClient) -> None:
    start_sh = f"""#!/bin/bash
set -e
export PATH={NODE_DIR}:$PATH
cd {REMOTE_DIR}/backend

# Stop listener on PORT (old deploys may leave a stale node process)
PORT={PORT}
OLD_PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | head -1)
if [ -n "$OLD_PID" ]; then
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 1
fi
if [ -f {REMOTE_DIR}/server.pid ]; then
  kill -9 "$(cat {REMOTE_DIR}/server.pid)" 2>/dev/null || true
fi
pkill -9 -f '{REMOTE_DIR}/backend' 2>/dev/null || true
sleep 1

npx playwright install chromium >/dev/null 2>&1 || true
nohup {NODE_BIN} src/index.js > {REMOTE_DIR}/server.log 2>&1 &
echo $! > {REMOTE_DIR}/server.pid
sleep 2
ss -tlnp | grep ":$PORT " || (echo "failed to bind $PORT"; tail -20 {REMOTE_DIR}/server.log; exit 1)
"""
    sftp = client.open_sftp()
    remote_start = f"{REMOTE_DIR}/start.sh"
    with sftp.open(remote_start, "w") as f:
        f.write(start_sh)
    sftp.chmod(
        remote_start,
        stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH,
    )
    sftp.close()


def main() -> int:
    if not PASSWORD:
        print("Set DEPLOY_PASSWORD env var (e.g. $env:DEPLOY_PASSWORD='1234')")
        return 1

    run_local_build()
    archive = create_archive()
    print(f"[deploy] Archive: {archive} ({archive.stat().st_size // 1024} KB)")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    ssh_exec(
        client,
        f"mkdir -p {REMOTE_DIR}/backend/data {REMOTE_DIR}/backend/repos {REMOTE_DIR}/backend/results",
    )

    remote_tar = "/tmp/uiauto-deploy.tar.gz"
    sftp = client.open_sftp()
    print(f"[deploy] Uploading to {remote_tar}...")
    sftp.put(str(archive), remote_tar)
    sftp.close()
    archive.unlink(missing_ok=True)

    ssh_exec(
        client,
        f"test -f {REMOTE_DIR}/backend/data/uiauto.db && "
        f"cp -a {REMOTE_DIR}/backend/data/uiauto.db "
        f"{REMOTE_DIR}/backend/data/uiauto.db.pre-deploy-bak || true",
    )
    ssh_exec(
        client,
        f"tar -xzf {remote_tar} -C {REMOTE_DIR} "
        f"--exclude='backend/data/uiauto.db' "
        f"--exclude='backend/data/*.db-wal' "
        f"--exclude='backend/data/*.db-shm'",
    )
    ssh_exec(client, f"rm -f {remote_tar}")
    ssh_exec(
        client,
        f"chmod -R u+rwX {REMOTE_DIR}/backend/data {REMOTE_DIR}/backend/repos "
        f"{REMOTE_DIR}/backend/results 2>/dev/null || true",
    )
    fix_data_permissions(client)

    ensure_remote_env(client)
    strip_dev_auth_flags(client)
    write_start_script(client)

    path_prefix = f"export PATH={NODE_DIR}:$PATH &&"
    ssh_exec(client, f"rm -rf {REMOTE_DIR}/backend/node_modules")
    ssh_exec(client, f"{path_prefix} cd {REMOTE_DIR}/backend && npm install", timeout=600)
    ssh_exec(
        client,
        f"{path_prefix} cd {REMOTE_DIR}/backend && npx playwright install chromium",
        timeout=600,
    )
    ssh_exec(client, f"bash {REMOTE_DIR}/start.sh")
    _, out, _ = ssh_exec(client, f"sleep 2; ss -tlnp | grep {PORT} || true")
    client.close()

    ok = str(PORT) in out
    print(f"\n[deploy] Done: http://{HOST}:{PORT}/")
    print("Future updates: $env:DEPLOY_PASSWORD='1234'; python scripts/deploy_server.py")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
