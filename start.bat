@echo off
title Khoi dong Dalat TikTok Carousel Tool
cd /d "%~dp0"

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
if not exist "%~dp0backend\.env" (
  echo [LOI] Khong tao duoc file cau hinh: %~dp0backend\.env
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
echo Sau khi san sang, tool se mo cua so rieng tren Chrome; neu khong co Chrome se dung Edge.
echo Tool dung co dinh backend 3000 va frontend 3001 de tranh lech phien.
echo (Ban co the nhan Ctrl+C de tat tool khi khong su dung)
echo.

set DALAT_OPEN_BROWSER=1

if exist "frontend\.next" (
  echo Dang xoa cache Next.js cu de tranh loi khi doi may...
  rmdir /s /q "frontend\.next"
)

call npm run dev
if errorlevel 1 (
  echo.
  echo [LOI] Tool da dung bat thuong. Xem thong bao phia tren de xu ly.
  pause
  exit /b 1
)
