@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title UIAuto Local Runner - Stop

echo Stopping processes on port 9321...
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":9321" ^| findstr "LISTENING"') do (
  echo   kill PID %%p
  taskkill /PID %%p /T /F >nul 2>&1
  set FOUND=1
)

if "%FOUND%"=="0" (
  echo No listener on port 9321.
) else (
  echo Done. You can run start.bat again.
)
echo.
pause
