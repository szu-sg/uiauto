@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\UIAuto Local Runner.lnk"
set "TARGET=%~dp0start.bat"
set "WORKDIR=%~dp0"

powershell -NoProfile -Command ^
  "$s = New-Object -ComObject WScript.Shell; ^
   $l = $s.CreateShortcut('%SHORTCUT%'); ^
   $l.TargetPath = '%TARGET%'; ^
   $l.WorkingDirectory = '%WORKDIR%'; ^
   $l.WindowStyle = 7; ^
   $l.Description = 'UIAuto local Playwright runner'; ^
   $l.Save()"

if errorlevel 1 goto fail

echo Added to Windows startup (runs hidden on login).
echo To remove: run remove-autostart.bat
pause
exit /b 0

:fail
echo Failed to create startup shortcut.
pause
exit /b 1
