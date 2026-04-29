@echo off
setlocal
cd /d "%~dp0"

echo Starting Dalat Carousel backend on http://127.0.0.1:3000/
start "Dalat Carousel Backend" cmd /k "cd /d ""%~dp0backend"" && npm run start:dev"

echo Starting Next.js frontend on http://127.0.0.1:3001/
start "Dalat Carousel Next Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

timeout /t 8 /nobreak >nul
start "" "http://127.0.0.1:3001/"
