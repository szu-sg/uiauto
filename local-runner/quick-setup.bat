@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if /i not "%~1"=="run" (
  start "UIAuto Setup" cmd /k "%~f0" run
  exit /b 0
)

title UIAuto Local Runner - Quick Setup
echo.
echo ========================================
echo   Install and Start
echo ========================================
echo.

call "%~dp0install.bat" run auto
if errorlevel 1 goto stop

echo.
echo Install OK. Starting runner...
echo.
call "%~dp0start.bat" run auto
goto end

:stop
echo Install failed. Stopped.
pause
exit /b 1

:end
