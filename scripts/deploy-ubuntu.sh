#!/bin/bash
# 在 Ubuntu 服务器项目根目录执行： ./scripts/deploy-ubuntu.sh
# 用于：拉取最新代码、安装依赖、构建前端、重启 pm2（若已用 pm2）
set -e
cd "$(dirname "$0")/.."
echo "[deploy] Pulling..."
git pull origin main
echo "[deploy] Installing dependencies..."
npm run install:all
echo "[deploy] Building frontend..."
npm run build
if command -v pm2 >/dev/null 2>&1 && pm2 describe uiauto >/dev/null 2>&1; then
  echo "[deploy] Restarting pm2 uiauto..."
  pm2 restart uiauto
else
  echo "[deploy] Done. Start manually: npm start (or pm2 start backend/src/index.js --name uiauto --cwd backend)"
fi
