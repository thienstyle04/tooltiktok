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

if not exist "backend\data\sheet-drive-images.json" (
  if exist "backend\data\sheet-drive-images.seed.json" (
    copy /y "backend\data\sheet-drive-images.seed.json" "backend\data\sheet-drive-images.json" >nul
    echo ^> Da tao cache anh Drive tu seed (anh hien ngay, khong can doi sync).
  ) else (
    echo Canh bao: Chua co cache anh Drive. Anh co the khong hien cho den khi sync xong.
    echo Neu may khac bi loi anh, chay update.bat hoac copy sheet-drive-images.json tu may chinh.
  )
)

echo Dang khoi dong Backend va Frontend cung luc...
echo Sau khi san sang, trinh duyet se tu mo http://localhost:3001
echo Neu port bi doi, script se thu port 3001-3005.
echo (Ban co the nhan Ctrl+C de tat tool khi khong su dung)
echo.

rem Mo trinh duyet bang PowerShell (on dinh hon tren may moi / khong co Chrome)
set DALAT_OPEN_BROWSER=0
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-open-browser.ps1"

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
