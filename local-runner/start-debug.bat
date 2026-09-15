@echo off
setlocal EnableExtensions

if /i not "%~1"=="run" (
  start "UIAuto Runner Debug" cmd /k "%~f0" run
  exit /b 0
)

cd /d "%~dp0"
title UIAuto Local Runner (debug)

where node >nul 2>&1
if errorlevel 1 goto no_node

netstat -ano | findstr ":9321" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto already_running

if not exist "node_modules\@playwright\test" (
  call "%~dp0install.bat" run auto
  if errorlevel 1 goto fail
)

echo Starting runner (visible window for debugging)...
call npm.cmd start
goto end

:already_running
echo Port 9321 already in use.
pause
exit /b 0

:no_node
echo [ERROR] Node.js not found.
pause
exit /b 1

:fail
pause
exit /b 1

:end
exit /b 0
