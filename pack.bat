@echo off
title Dong goi chuyen may - Dalat TikTok Carousel Tool
cd /d "%~dp0"
echo ==============================================================
echo DONG GOI CHUYEN SANG MAY KHAC
echo ==============================================================
echo Goi gom: code dung phien ban + TOAN BO du lieu nguoi dung (list da tao,
echo chinh sua chu, lich su dung dia diem, hook, lich hen gio) + mau rieng.
echo Hay TAT tool truoc khi dong goi.
echo.
set "PACK_ARGS="
choice /C YN /N /M "Kem anh Drive da tai (khoang 8-9 GB, may moi khong phai tai lai)? [Y/N] "
if errorlevel 2 goto ASK_ENV
set "PACK_ARGS=%PACK_ARGS% --with-image-cache"
:ASK_ENV
choice /C YN /N /M "Kem file backend\.env (co key API DeepSeek)? [Y/N] "
if errorlevel 2 goto RUN
set "PACK_ARGS=%PACK_ARGS% --with-env"
:RUN
echo.
node "%~dp0scripts\pack-migration.cjs"%PACK_ARGS%
if errorlevel 1 (
  echo.
  echo [LOI] Dong goi that bai. Xem thong bao phia tren.
)
echo.
pause
