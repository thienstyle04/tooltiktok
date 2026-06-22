@echo off
title Cap nhat Dalat TikTok Carousel Tool
cd /d "%~dp0"

echo ==============================================================
echo CAP NHAT TOOL TU GITHUB (branch fearch)
echo ==============================================================
echo.
echo Git se chi cap nhat code. Du lieu Sheet va anh tu dong tai khi chay start.bat lan dau.
echo.

git fetch origin fearch
if errorlevel 1 (
  echo [LOI] Khong ket noi duoc GitHub. Kiem tra mang hoac git remote.
  pause
  exit /b 1
)

git restore package.json backend/package.json frontend/package.json frontend/lib/appVersion.js VERSION 2>nul

git pull origin fearch
if errorlevel 1 (
  echo.
  echo [LOI] Pull that bai. Chay "git status" va gui anh man hinh neu can ho tro.
  pause
  exit /b 1
)

echo.
echo ==============================================================
echo CAP NHAT THANH CONG!
echo Chay start.bat de khoi dong tool (trinh duyet se tu mo).
echo ==============================================================
pause
