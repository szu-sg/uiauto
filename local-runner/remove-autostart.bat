@echo off
setlocal
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\UIAuto Local Runner.lnk"
if exist "%SHORTCUT%" (
  del "%SHORTCUT%"
  echo Removed from Windows startup.
) else (
  echo Startup shortcut not found.
)
pause
