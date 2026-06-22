@echo off
title Cap nhat Dalat TikTok Carousel Tool
cd /d "%~dp0"

echo ==============================================================
echo CAP NHAT TOOL TU GITHUB (branch main)
echo ==============================================================
echo.
echo Day la ban phat hanh on dinh. May dev test tren nhanh fearch truoc.
echo Du lieu Sheet va anh tu dong tai khi chay start.bat lan dau.
echo.

git fetch origin main
if errorlevel 1 (
  echo [LOI] Khong ket noi duoc GitHub. Kiem tra mang hoac git remote.
  pause
  exit /b 1
)

call :cleanup_unfinished_git
if errorlevel 1 (
  pause
  exit /b 1
)

git checkout main >nul 2>&1
git restore package.json backend/package.json frontend/package.json frontend/lib/appVersion.js VERSION 2>nul

git pull origin main
if errorlevel 1 (
  echo.
  echo [LOI] Pull that bai.
  echo.
  echo Thu chay lenh sau trong thu muc tool roi chay lai update.bat:
  echo   git merge --abort
  echo   git rebase --abort
  echo   git status
  echo.
  echo Neu van loi, gui anh man hinh git status de duoc ho tro.
  pause
  exit /b 1
)

echo.
echo ==============================================================
echo CAP NHAT THANH CONG!
echo Chay start.bat de khoi dong tool (trinh duyet se tu mo).
echo ==============================================================
pause
exit /b 0

:cleanup_unfinished_git
echo [git] Kiem tra merge/rebase dang do...
git merge --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy merge cu.
git rebase --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy rebase cu.
git cherry-pick --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy cherry-pick cu.
exit /b 0
