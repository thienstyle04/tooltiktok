@echo off
title Dong goi - Dalat TikTok Carousel Tool
cd /d "%~dp0"
echo ==============================================================
echo DONG GOI TOOL
echo ==============================================================
echo  1 = Chuyen sang may khac CUA MINH: code + TOAN BO du lieu (list da tao,
echo      chinh sua chu, lich su dung dia diem, hook, lich hen gio, link Sheet) + mau rieng.
echo  2 = Ban giao SACH cho nguoi khac: chi code, KHONG du lieu, KHONG link Google Sheet,
echo      khong mau rieng, khong key API. Nguoi nhan tu them link Sheet cua ho.
echo Hay TAT tool truoc khi dong goi.
echo.
choice /C 12 /N /M "Chon 1 hoac 2: "
if errorlevel 2 goto CLEAN
set "PACK_ARGS="
choice /C YN /N /M "Kem anh Drive da tai (khoang 8-9 GB, may moi khong phai tai lai)? [Y/N] "
if errorlevel 2 goto ASK_ENV
set "PACK_ARGS=%PACK_ARGS% --with-image-cache"
:ASK_ENV
choice /C YN /N /M "Kem file backend\.env (co key API DeepSeek)? [Y/N] "
if errorlevel 2 goto RUN
set "PACK_ARGS=%PACK_ARGS% --with-env"
goto RUN
:CLEAN
set "PACK_ARGS= --clean"
:RUN
echo.
node "%~dp0scripts\pack-migration.cjs"%PACK_ARGS%
if errorlevel 1 (
  echo.
  echo [LOI] Dong goi that bai. Xem thong bao phia tren.
)
echo.
pause
