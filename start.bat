@echo off
title Khoi dong Dalat TikTok Carousel Tool
cd /d "%~dp0"

rem A stable root must dispatch its pointer even when the updater inherited
rem DALAT_INSTALL_ROOT from the previous backend. It has no backend/frontend.
if exist "%~dp0shared\current.json" goto DISPATCH_CURRENT

rem A release launched by launch-current.ps1 already has a stable install root.
if defined DALAT_INSTALL_ROOT goto RUN_RELEASE

rem First launch from a fresh git clone: install the updater once.
if not exist "%~dp0shared\current.json" (
  echo Dang cai trinh cap nhat lan dau va chuyen du lieu vao shared\data...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-updates.ps1" -InstallRoot "%~dp0." -PackageRoot "%~dp0."
  if errorlevel 1 (
    echo.
    echo [LOI] Chua cai duoc trinh cap nhat. Du lieu cu duoc giu nguyen; vui long kiem tra thong bao phia tren.
    pause
    exit /b 1
  )
)

rem Stable install root: dispatch to one complete backend/frontend release.
:DISPATCH_CURRENT
if exist "%~dp0shared\current.json" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-current.ps1" -InstallRoot "%~dp0."
  exit /b %errorlevel%
)

:RUN_RELEASE
echo ==============================================================
echo KHOI DONG DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.

echo Dang kiem tra moi truong dung chung...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-portable-runtime.ps1"
if errorlevel 1 (
  echo.
  echo [LOI] Khong the chuan bi moi truong. Kiem tra Node.js va ket noi mang.
  pause
  exit /b 1
)
if not exist "%~dp0backend\.env" (
  if exist "%~dp0backend\.env.example" (
    copy /y "%~dp0backend\.env.example" "%~dp0backend\.env" >nul
  )
)
rem Trong khoi lenh, duong dan phai nam trong ngoac kep: thu muc ten co ngoac don se lam vo khoi.
if not exist "%~dp0backend\.env" (
  echo [LOI] Khong tao duoc file cau hinh: "%~dp0backend\.env"
  pause
  exit /b 1
)
echo ^> Da xac nhan file cau hinh: %~dp0backend\.env
echo.

rem Backup list AI truoc khi khoi dong de tranh mat du lieu
if exist "backend\data\generated-caption-lists.json" (
  copy /y "backend\data\generated-caption-lists.json" "backend\data\generated-caption-lists.backup.json" >nul
  echo ^> Da backup list AI vao generated-caption-lists.backup.json
)

echo Dang khoi dong Backend va Frontend cung luc...
echo Tool mo ngay cua so rieng tren Chrome (khong co Chrome se dung Edge) va hien tien do khoi dong.
echo Tool dung co dinh backend 3000 va frontend 3001 de tranh lech phien.
echo (Dong cua so nay hoac nhan Ctrl+C de tat tool khi khong su dung)
echo.

set DALAT_OPEN_BROWSER=1

rem Giao dien chay ban build (frontend\.next-build) cho muot: scripts\dev.js chi build lai
rem khi ma giao dien/phien ban thay doi (khoang 20 giay), build loi thi tu dung next dev.
call npm run dev
if errorlevel 1 (
  echo.
  echo [LOI] Tool da dung bat thuong. Xem thong bao phia tren de xu ly.
  pause
  exit /b 1
)
