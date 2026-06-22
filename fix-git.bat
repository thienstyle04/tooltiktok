@echo off
title Sua loi Git truoc khi update
cd /d "%~dp0"

echo ==============================================================
echo SUA LOI GIT (merge/rebase dang do)
echo ==============================================================
echo.

echo Dang huy merge/rebase/cherry-pick dang do (neu co)...
git merge --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy merge cu.
git rebase --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy rebase cu.
git cherry-pick --abort >nul 2>&1
if not errorlevel 1 echo ^> Da huy cherry-pick cu.

echo.
echo Trang thai Git hien tai:
git status
echo.
echo Neu khong con "merge" hoac "rebase", chay lai update.bat
echo ==============================================================
pause
