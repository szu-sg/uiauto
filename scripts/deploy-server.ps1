# 一键部署到内网服务器（与 CSR_Checklist 同一台机器）
# 用法：在 PowerShell 中于项目根目录执行
#   .\scripts\deploy-server.ps1

$ErrorActionPreference = "Stop"
$env:DEPLOY_PASSWORD = "1234"
python "$PSScriptRoot\deploy_server.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
