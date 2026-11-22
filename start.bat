@echo off
setlocal EnableExtensions
title TraderNet Journal - Launcher
cd /d "%~dp0"

echo.
echo  ==============================================
echo    TraderNet Journal - starting everything
echo  ==============================================
echo.

rem ---- 1. Requirements ---------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo  [X] Node.js was not found. Install it from https://nodejs.org and run this file again.
  goto :fail
)
where python >nul 2>&1
if errorlevel 1 (
  echo  [X] Python was not found. Install it from https://python.org
  echo      and tick "Add python.exe to PATH" during setup.
  goto :fail
)
if not exist "backend\.env" (
  echo  [X] backend\.env is missing.
  echo      Copy backend\.env.example to backend\.env and put your MongoDB connection string in it.
  goto :fail
)
if not exist "frontend\.env" (
  copy /y "frontend\.env.example" "frontend\.env" >nul
  echo  [+] Created frontend\.env
)

rem ---- 2. Install packages on first run ----------------------------------
if not exist "backend\node_modules" (
  echo  [..] Installing server packages, first run only...
  pushd backend
  call npm install
  popd
)
if not exist "frontend\node_modules" (
  echo  [..] Installing site packages, first run only...
  pushd frontend
  call npm install
  popd
)
python -c "import MetaTrader5" >nul 2>&1
if errorlevel 1 (
  echo  [..] Installing Python packages for MT5...
  python -m pip install -r sync\requirements.txt
)

rem ---- 3. MetaTrader 5 ----------------------------------------------------
tasklist /fi "imagename eq terminal64.exe" 2>nul | find /i "terminal64.exe" >nul
if errorlevel 1 (
  if exist "%ProgramFiles%\MetaTrader 5\terminal64.exe" (
    echo  [..] Opening MetaTrader 5...
    start "" "%ProgramFiles%\MetaTrader 5\terminal64.exe"
  ) else (
    echo  [!] MetaTrader 5 is not running. Open it yourself and log in to your account.
  )
) else (
  echo  [OK] MetaTrader 5 is already running
)

rem ---- 4. Server (backend) -----------------------------------------------
curl -s -o nul --max-time 2 http://localhost:5000/health
if errorlevel 1 (
  echo  [..] Starting the server...
  start "TraderNet Journal - Server (keep open)" /d "%~dp0backend" cmd /k "npm run dev"
) else (
  echo  [OK] Server is already running
)

rem ---- 5. Site (frontend) ------------------------------------------------
curl -s -o nul --max-time 2 http://localhost:5173
if errorlevel 1 (
  echo  [..] Starting the site...
  start "TraderNet Journal - Site (keep open)" /d "%~dp0frontend" cmd /k "npm run dev"
) else (
  echo  [OK] Site is already running
)

rem ---- 6. Wait until both answer, then open the browser ------------------
echo  [..] Waiting for the server and the site to come up...
set /a tries=0
:wait
set /a tries+=1
if %tries% gtr 60 (
  echo  [!] Still not up after 2 minutes. Check the "Server" and "Site" windows for errors.
  goto :fail
)
curl -s -o nul --max-time 2 http://localhost:5000/health || (timeout /t 2 /nobreak >nul & goto :wait)
curl -s -o nul --max-time 2 http://localhost:5173 || (timeout /t 2 /nobreak >nul & goto :wait)

echo  [OK] Everything is running. Opening the journal...
start "" http://localhost:5173
echo.
echo  Keep the "Server" and "Site" windows open while you use the journal.
echo  This window closes in 5 seconds.
timeout /t 5 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
