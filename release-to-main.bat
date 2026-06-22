@echo off
title Day fearch len main (may dev)
cd /d "%~dp0"

echo ==============================================================
echo DAY BAN ON TU fearch LEN main
echo ==============================================================
echo.
echo Quy trinh:
echo   1. Test xong tren nhanh fearch
echo   2. Chay file nay tren MAY DEV
echo   3. Cac may khac chay update.bat (pull tu main)
echo.

git fetch origin fearch main
if errorlevel 1 (
  echo [LOI] Khong ket noi duoc GitHub.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git branch --show-current') do set CURRENT=%%b
if /i not "%CURRENT%"=="fearch" (
  echo [CANH BAO] Ban dang o nhanh "%CURRENT%", khong phai fearch.
  echo Hay commit/push fearch truoc, roi chay lai file nay.
  pause
  exit /b 1
)

git status --porcelain | findstr /v "^??" >nul 2>nul
if not errorlevel 1 (
  echo [LOI] Con thay doi chua commit tren fearch. Commit va push truoc.
  git status --short
  pause
  exit /b 1
)

echo Dang push fearch len GitHub...
git push origin fearch
if errorlevel 1 (
  echo [LOI] Push fearch that bai.
  pause
  exit /b 1
)

echo.
echo Dang merge fearch vao main...
git checkout main
if errorlevel 1 (
  echo [LOI] Khong chuyen sang main duoc.
  pause
  exit /b 1
)

git pull origin main
git merge origin/fearch -m "Release: merge fearch vao main"
if errorlevel 1 (
  echo [LOI] Merge that bai. Giai quyet conflict roi chay lai release-to-main.bat
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo [LOI] Push main that bai.
  pause
  exit /b 1
)

git checkout fearch

echo.
echo ==============================================================
echo DA DAY LEN main THANH CONG!
echo Cac may khac: chay update.bat de nhan ban moi.
echo ==============================================================
pause
