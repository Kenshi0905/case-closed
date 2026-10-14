@echo off
title Case Closed - Stop Local AI
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\stop-local-ai.ps1"
echo.
pause
