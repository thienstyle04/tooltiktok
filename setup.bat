@echo off
chcp 65001 >nul
title Setup Dalat TikTok Carousel Tool

echo ==============================================================
echo BẮT ĐẦU CÀI ĐẶT MÔI TRƯỜNG CHO DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.

echo [1/3] Đang cài đặt thư viện cho hệ thống chính (root)...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Cài đặt thư viện root thất bại! Vui lòng kiểm tra lại Node.js và npm.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [2/3] Đang cài đặt thư viện cho Backend...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Cài đặt thư viện backend thất bại!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [3/3] Đang cài đặt thư viện cho Frontend...
cd frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Cài đặt thư viện frontend thất bại!
    pause
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [4/4] Kiểm tra biến môi trường...
if not exist "backend\.env" (
    echo ^> Chưa có file backend\.env, đang copy từ mẫu...
    copy "backend\.env.example" "backend\.env" >nul
    echo ^> Đã tạo file backend\.env. NHỚ CẬP NHẬT LẠI KEY DEEPSEEK TRONG FILE ĐÓ!
) else (
    echo ^> File backend\.env đã tồn tại.
)
echo.

echo ==============================================================
echo CÀI ĐẶT THÀNH CÔNG!
echo Bạn đã có thể chạy tool bằng cách mở file "start.bat"
echo ==============================================================
pause
