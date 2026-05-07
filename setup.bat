@echo off
title Setup Dalat TikTok Carousel Tool

echo ==============================================================
echo BAT DAU CAI DAT MOI TRUONG CHO DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.

echo [1/4] Dang cai dat thu vien cho he thong chinh (root)...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien root that bai! Vui long kiem tra lai Node.js va npm.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [2/4] Dang cai dat thu vien cho Backend...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien backend that bai!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [3/4] Dang cai dat thu vien cho Frontend...
cd frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LOI] Cai dat thu vien frontend that bai!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [4/4] Kiem tra bien moi truong...
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

echo ==============================================================
echo CAI DAT THANH CONG!
echo Ban da co the chay tool bang cach mo file "start.bat"
echo ==============================================================
pause
