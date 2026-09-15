@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node

netstat -ano | findstr ":9321" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto already_running

if not exist "node_modules\@playwright\test" goto do_install

wscript "%~dp0run-server-hidden.vbs"
echo UIAuto runner started in background (port 9321).
echo Log: %~dp0runner.log
timeout /t 2 /nobreak >nul
exit /b 0

:do_install
echo First run: installing dependencies (3-10 min)...
call "%~dp0install.bat" run auto
if errorlevel 1 goto fail
wscript "%~dp0run-server-hidden.vbs"
echo UIAuto runner started in background (port 9321).
timeout /t 2 /nobreak >nul
exit /b 0

:already_running
echo Runner already running on port 9321.
echo Refresh the platform page and click Re-detect.
timeout /t 3 /nobreak >nul
exit /b 0

:no_node
echo [ERROR] Node.js not found. Install from https://nodejs.org/
pause
exit /b 1

:fail
echo [ERROR] Setup failed. Run install.bat manually.
pause
exit /b 1
