@echo off
setlocal EnableExtensions
title Sua cache API key - Dalat TikTok Carousel Tool
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fix-api-key-cache.ps1"

echo.
pause
