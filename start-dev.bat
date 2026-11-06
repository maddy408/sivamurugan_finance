@echo off
title Siva Murugan Chit Fund - Development Launcher
echo ===================================================
echo   Siva Murugan Chit Fund - Starting Local Servers
echo ===================================================
echo.

echo [1/2] Starting PHP Backend API on http://127.0.0.1:8000 ...
start "SMCF PHP API (Port 8000)" cmd /k "cd /d ""%~dp0backend"" && php -S 0.0.0.0:8000 -t public public/router.php"

echo [2/2] Starting Vite Frontend on http://localhost:5173 ...
cd /d "%~dp0frontend"
npm run dev

