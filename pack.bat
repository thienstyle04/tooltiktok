@echo off
title Pack portable - Dalat TikTok Carousel Tool
echo Dang tao file nen portable (bo qua node_modules, .git, cache)...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\pack-lean.ps1"
echo.
pause
