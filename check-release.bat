@echo off
title Kiem tra fearch vs main
cd /d "%~dp0"
node scripts/check-release-status.js
echo.
pause
