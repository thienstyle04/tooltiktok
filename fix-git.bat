@echo off
title Sua loi Git truoc khi update
cd /d "%~dp0"

echo ==============================================================
echo SUA LOI GIT (merge/rebase dang do)
echo ==============================================================
echo.

if exist ".git\MERGE_HEAD" (
  echo Dang huy merge cu...
  git merge --abort
)

if exist ".git\rebase-merge" (
  echo Dang huy rebase cu...
  git rebase --abort
)

if exist ".git\rebase-apply" (
  git rebase --abort
)

if exist ".git\CHERRY_PICK_HEAD" (
  git cherry-pick --abort
)

echo.
echo Trang thai Git hien tai:
git status
echo.
echo Neu khong con "merge" hoac "rebase", chay lai update.bat
echo ==============================================================
pause
