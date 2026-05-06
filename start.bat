@echo off
chcp 65001 >nul
title Khởi động Dalat TikTok Carousel Tool

echo ==============================================================
echo KHỞI ĐỘNG DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.
echo Đang khởi động Backend và Frontend cùng lúc...
echo Vui lòng đợi trong giây lát, ứng dụng sẽ chạy ở http://localhost:3001
echo (Bạn có thể nhấn Ctrl+C để tắt tool khi không sử dụng)
echo.

call npm run dev

pause
