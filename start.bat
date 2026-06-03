@echo off
title Khoi dong Dalat TikTok Carousel Tool
cd /d "%~dp0"

echo ==============================================================
echo KHOI DONG DALAT TIKTOK CAROUSEL TOOL
echo ==============================================================
echo.

rem Backup list AI truoc khi khoi dong de tranh mat du lieu
if exist "backend\data\generated-caption-lists.json" (
  copy /y "backend\data\generated-caption-lists.json" "backend\data\generated-caption-lists.backup.json" >nul
  echo ^> Da backup list AI vao generated-caption-lists.backup.json
)

echo Dang khoi dong Backend va Frontend cung luc...
echo Vui long doi trong giay lat, ung dung se chay o http://localhost:3001
echo (Ban co the nhan Ctrl+C de tat tool khi khong su dung)
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING" /c:":3001 .*LISTENING"') do (
  echo Canh bao: Port 3000 hoac 3001 dang duoc su dung boi PID %%a.
  echo Neu giao dien van loi 404, hay tat cua so tool cu hoac chay: taskkill /PID %%a /F
  echo.
)

if exist "frontend\.next" (
  echo Dang xoa cache Next.js cu de tranh loi khi doi may...
  rmdir /s /q "frontend\.next"
)

call npm run dev

pause
