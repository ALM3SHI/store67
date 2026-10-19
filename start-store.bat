@echo off
setlocal EnableExtensions
title STORE 76 - local server
cd /d "%~dp0"

echo ==================================================
echo   STORE 76 - starting the store locally
echo ==================================================
echo.

rem ---- 1) Node.js 20+ ------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed.
  echo     Download the LTS version from https://nodejs.org then run this file again.
  start "" https://nodejs.org
  goto fail
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo [X] Node.js 20 or newer is required. You have:
  node -v
  goto fail
)
echo [1/5] Node.js OK

rem ---- 2) Dependencies: install only when missing or package-lock changed
set NEED_INSTALL=0
if not exist "node_modules\" set NEED_INSTALL=1
if not exist "node_modules\.store76-lock" set NEED_INSTALL=1
if %NEED_INSTALL%==0 (
  fc /b "package-lock.json" "node_modules\.store76-lock" >nul 2>nul || set NEED_INSTALL=1
)
if %NEED_INSTALL%==1 (
  echo [2/5] Installing packages - first time takes a few minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
  copy /y "package-lock.json" "node_modules\.store76-lock" >nul
) else (
  echo [2/5] Packages up to date
)

rem ---- 3) .env.local -------------------------------------------------
if not exist ".env.local" (
  call npm run env:init
  if errorlevel 1 goto fail
  echo [3/5] Created .env.local from .env.example
) else (
  echo [3/5] .env.local found
)

rem ---- 4) Database: apply new migrations + starter data (safe to repeat)
echo [4/5] Updating the database...
call npm run db:setup
if errorlevel 1 goto fail

rem ---- 5) First run only: create the admin account -------------------
if not exist "node_modules\.store76-admin-done" (
  echo.
  echo --------------------------------------------------
  echo   Admin account for the control panel /admin
  echo   Type your email, or just press Enter to skip
  echo   if you already created one.
  echo --------------------------------------------------
  set "ADMIN_EMAIL="
  set /p "ADMIN_EMAIL=Admin email: "
  call :create_admin
  if errorlevel 1 goto fail
)
echo [5/5] Ready

rem ---- Start the dev server and open the browser once it is up -------
echo.
echo   Store:   http://localhost:3000/ar
echo   Admin:   http://localhost:3000/admin
echo   Close this window (or press Ctrl+C) to stop the store.
echo.
start "" /b cmd /c "timeout /t 10 /nobreak >nul & start "" http://localhost:3000/ar"
call npm run dev
goto end

:create_admin
if "%ADMIN_EMAIL%"=="" (
  type nul > "node_modules\.store76-admin-done"
  exit /b 0
)
call npm run admin:create -- "%ADMIN_EMAIL%" "Owner" owner
if errorlevel 1 exit /b 1
type nul > "node_modules\.store76-admin-done"
echo.
echo   ^>^> Copy the password above now - it is shown only once.
echo      You can reset it later from the login page or by running this:
echo      npm run admin:create -- your@email.com "Owner" owner
echo.
pause
exit /b 0

:fail
echo.
echo [X] Something went wrong - read the message above.
pause
exit /b 1

:end
endlocal
