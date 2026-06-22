@echo off
title Cap nhat Dalat TikTok Carousel Tool
cd /d "%~dp0"

echo ==============================================================
echo CAP NHAT TOOL TU GITHUB (branch fearch)
echo ==============================================================
echo.
echo Git se chi cap nhat code. used-inventory moi may tu tao khi chay tool.
echo Cache anh Drive: neu chua co tren may, update.bat tu copy tu file seed.
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

if not exist "backend\data\sheet-drive-images.json" (
  if exist "backend\data\sheet-drive-images.seed.json" (
    copy /y "backend\data\sheet-drive-images.seed.json" "backend\data\sheet-drive-images.json" >nul
    echo ^> Da tao cache anh Drive tu seed.
  )
)

echo.
echo ==============================================================
echo CAP NHAT THANH CONG!
echo Chay start.bat de khoi dong tool (trinh duyet se tu mo).
echo ==============================================================
pause
