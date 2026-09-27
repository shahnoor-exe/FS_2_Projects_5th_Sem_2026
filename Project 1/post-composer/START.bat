@echo off
setlocal EnableDelayedExpansion
title Social Composer — Launcher

:: ═══════════════════════════════════════════════════════════════════════════════
::  SOCIAL COMPOSER — ONE-CLICK LAUNCHER
::  Starts: Backend (Node.js/Express) + Frontend (React/Vite)
::  Database: MongoDB Atlas (cloud — no local launch needed)
:: ═══════════════════════════════════════════════════════════════════════════════

:: Colour codes (Windows 10+)
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          SOCIAL COMPOSER — PROJECT LAUNCHER              ║
echo  ║  Backend  ^| Frontend  ^| MongoDB Atlas (cloud)            ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: ─── Resolve the directory this .bat file lives in ───────────────────────────
set "ROOT=%~dp0"
set "BACKEND=%ROOT%social-composer-backend"
set "FRONTEND=%ROOT%social-composer-frontend"
set "ENV_FILE=%BACKEND%\.env"

:: ─── 1. Check Node.js is installed ───────────────────────────────────────────
echo  [1/5] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Node.js is not installed or not on PATH.
    echo          Download it from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo         Found Node.js !NODE_VER!

:: ─── 2. Check .env is configured ─────────────────────────────────────────────
echo  [2/5] Checking backend .env configuration...
if not exist "%ENV_FILE%" (
    color 0C
    echo.
    echo  [ERROR] .env file not found at:
    echo          %ENV_FILE%
    echo.
    pause
    exit /b 1
)

:: Look for placeholder values — warn but don't stop
findstr /C:"your_atlas_connection_string" "%ENV_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    color 0E
    echo.
    echo  [WARNING] MONGO_URI still has a placeholder value in .env
    echo            The backend will fail to connect to MongoDB Atlas.
    echo            Edit:  %ENV_FILE%
    echo.
    echo  Press any key to continue anyway, or close this window to cancel...
    pause >nul
    color 0A
)

findstr /C:"your_cloud_name" "%ENV_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    color 0E
    echo.
    echo  [WARNING] Cloudinary credentials still have placeholder values in .env
    echo            Media uploads will not work until you fill them in.
    echo.
    echo  Press any key to continue anyway, or close this window to cancel...
    pause >nul
    color 0A
)

echo         .env file found.

:: ─── 3. Install backend dependencies if missing ───────────────────────────────
echo  [3/5] Checking backend dependencies...
if not exist "%BACKEND%\node_modules" (
    echo         node_modules not found — running npm install for backend...
    pushd "%BACKEND%"
    call npm install
    popd
    if %errorlevel% neq 0 (
        color 0C
        echo  [ERROR] npm install failed for backend. Check the output above.
        pause
        exit /b 1
    )
    echo         Backend dependencies installed.
) else (
    echo         Backend node_modules found. Skipping install.
)

:: ─── 4. Install frontend dependencies if missing ──────────────────────────────
echo  [4/5] Checking frontend dependencies...
if not exist "%FRONTEND%\node_modules" (
    echo         node_modules not found — running npm install for frontend...
    pushd "%FRONTEND%"
    call npm install
    popd
    if %errorlevel% neq 0 (
        color 0C
        echo  [ERROR] npm install failed for frontend. Check the output above.
        pause
        exit /b 1
    )
    echo         Frontend dependencies installed.
) else (
    echo         Frontend node_modules found. Skipping install.
)

:: ─── 5. Launch servers in separate windows ────────────────────────────────────
echo  [5/5] Starting servers...
echo.

:: Launch backend in a new window
echo         Launching Backend  ^(http://localhost:5000^)...
start "Social Composer — Backend (port 5000)" cmd /k "cd /d "%BACKEND%" && color 0B && echo. && echo  ╔═══════════════════════════════════════╗ && echo  ║   BACKEND  ^|  http://localhost:5000   ║ && echo  ╚═══════════════════════════════════════╝ && echo. && npm run dev"

:: Give the backend a 3-second head-start before launching the frontend
timeout /t 3 /nobreak >nul

:: Launch frontend in a new window
echo         Launching Frontend ^(http://localhost:5173^)...
start "Social Composer — Frontend (port 5173)" cmd /k "cd /d "%FRONTEND%" && color 0D && echo. && echo  ╔═══════════════════════════════════════╗ && echo  ║  FRONTEND  ^|  http://localhost:5173  ║ && echo  ╚═══════════════════════════════════════╝ && echo. && npm run dev"

:: ─── Wait for frontend to be ready, then open browser ────────────────────────
echo.
echo  Waiting 6 seconds for servers to initialise...
timeout /t 6 /nobreak >nul

echo  Opening browser at http://localhost:5173 ...
start "" "http://localhost:5173"

:: ─── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  All servers launched!                                   ║
echo  ║                                                          ║
echo  ║  Frontend  →  http://localhost:5173                      ║
echo  ║  Backend   →  http://localhost:5000                      ║
echo  ║  Database  →  MongoDB Atlas (cloud, always-on)           ║
echo  ║                                                          ║
echo  ║  Close the two server windows to stop everything.        ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  This launcher window can be closed safely.
echo.
pause
