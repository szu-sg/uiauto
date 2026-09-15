@echo off
setlocal EnableExtensions

if /i not "%~1"=="run" (
  start "UIAuto Install" cmd /k "%~f0" run
  exit /b 0
)

cd /d "%~dp0"
title UIAuto Local Runner - Install

set "LOG=%~dp0install.log"
echo install start> "%LOG%"

echo.
echo ========================================
echo   UIAuto Local Runner - Install
echo ========================================
echo   Folder: %~dp0
echo   Log:    %LOG%
echo ========================================
echo.

echo [1/3] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 goto no_node
echo       Node version:
node -v
node -v>> "%LOG%" 2>&1
echo.

echo [2/3] npm install (1-5 min, output below)...
echo npm install>> "%LOG%"
call npm.cmd install --no-fund --no-audit
if errorlevel 1 goto install_fail
echo       npm install OK
echo.

echo [3/3] playwright install chromium (3-10 min)...
echo playwright install>> "%LOG%"
call npm.cmd exec -- playwright install chromium
if errorlevel 1 goto pw_warn
echo       Chromium install OK
goto install_done

:pw_warn
echo [WARN] Chromium install may have failed. Try start.bat anyway.
echo.

:install_done
echo ========================================
echo   DONE. Next: double-click start.bat
echo ========================================
echo install success>> "%LOG%"
goto end

:no_node
echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org/
echo Node.js not found>> "%LOG%"
goto fail

:install_fail
echo.
echo [ERROR] npm install failed. See install.log
goto fail

:fail
echo.
echo ========================================
echo   INSTALL FAILED - see install.log
echo ========================================
echo.
if /i not "%~2"=="auto" pause
exit /b 1

:end
echo.
if /i not "%~2"=="auto" (
  echo Press any key to close...
  pause >nul
)
exit /b 0
