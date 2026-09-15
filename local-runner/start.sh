#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo " UIAuto 本机运行器"
echo " 地址: http://127.0.0.1:9321"
echo " 调试时请保持本终端开启"
echo "========================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 18+："
  echo "  https://nodejs.org/"
  exit 1
fi

echo "Node 版本: $(node -v)"
echo

if [ ! -d "node_modules/@playwright/test" ]; then
  echo "首次运行，正在安装依赖（约 3–10 分钟）..."
  npm install --no-fund --no-audit
fi

npm start
