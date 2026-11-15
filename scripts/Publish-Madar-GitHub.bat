@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish-Madar-GitHub.ps1"
echo.
echo Publisher finished. Review any message above.
pause
