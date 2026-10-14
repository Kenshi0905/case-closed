@echo off
title Case Closed - Start Local AI
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\start-local-ai.ps1"
echo.
pause
