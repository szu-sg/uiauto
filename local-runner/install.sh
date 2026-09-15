#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo " UIAuto 本机运行器 - 安装依赖"
echo "========================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 18+："
  echo "  https://nodejs.org/"
  exit 1
fi

echo "Node 版本: $(node -v)"
echo
echo "正在安装依赖（首次可能需要几分钟）..."
npm install --no-fund --no-audit
echo
echo "[完成] 请运行 ./start.sh 或 npm start 启动运行器。"
