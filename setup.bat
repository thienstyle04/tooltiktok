@echo off
title Setup Dalat TikTok Carousel Tool

echo ==============================================================
echo BAT DAU CAI DAT MOI TRUONG CHO DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.

echo [1/5] Dang cai dat thu vien cho he thong chinh (root)...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien root that bai! Vui long kiem tra lai Node.js va npm.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [2/5] Dang cai dat thu vien cho Backend...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien backend that bai!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [3/5] Dang cai dat thu vien cho Frontend...
cd frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien frontend that bai!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [4/5] Kiem tra bien moi truong...
if not exist "backend\.env" (
    echo ^> Chua co file backend\.env, dang copy tu mau...
    copy "backend\.env.example" "backend\.env" >nul
    echo ^> Da tao file backend\.env. NHO CAP NHAT LAI KEY DEEPSEEK TRONG FILE DO!
) else (
    echo ^> File backend\.env da ton tai.
)
findstr /b /c:"DALAT_AUTO_SYNC_SHEET=" "backend\.env" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo DALAT_AUTO_SYNC_SHEET=true>>"backend\.env"
    echo ^> Da bat tu dong dong bo Google Sheet trong backend\.env.
)
echo.

echo [5/5] Kiem tra du lieu khoi tao...
if not exist "backend\data\sheet-drive-images.json" (
  echo ^> May moi se tu tai Google Sheet + anh Drive khi chay start.bat lan dau.
) else (
  echo ^> Da co cache anh Drive tren may nay.
)
echo.

echo ==============================================================
echo CAI DAT THANH CONG!
echo Ban da co the chay tool bang cach mo file "start.bat"
echo ==============================================================
pause
