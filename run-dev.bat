@echo off
chcp 65001 >nul
set "SCRIPT=%~dp0run-dev.ps1"

where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" dev %*
) else (
  powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" dev %*
)
