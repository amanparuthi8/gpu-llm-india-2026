@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: GPU & LLM Infrastructure Advisor — Windows Launcher
:: Double-click this file to start
:: ─────────────────────────────────────────────────────────────────────────────

title GPU ^& LLM Infrastructure Advisor

echo.
echo   ╔════════════════════════════════════════════╗
echo   ║   GPU ^& LLM Infrastructure Advisor         ║
echo   ║   India 2026 — Starting up...              ║
echo   ╚════════════════════════════════════════════╝
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto :install_node

:: Check version
for /f "tokens=1" %%V in ('node -e "process.stdout.write(process.version.slice(1).split('.')[0])"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 goto :install_old_node

echo   ✓ Node.js is installed ^(v%NODE_MAJOR%+^)
goto :start_server

:: ── Node.js not found ─────────────────────────────────────────────────────────
:install_node
echo   Node.js ^(v20+^) is required but not installed.
echo.
set /p CONFIRM="  Allow automatic Node.js installation? [Y/N]: "
if /i "%CONFIRM%" NEQ "Y" (
  echo.
  echo   Please install Node.js from https://nodejs.org
  echo   Then double-click launch.bat again.
  pause
  exit /b 1
)
goto :do_install

:install_old_node
echo   Node.js v%NODE_MAJOR% is installed but too old ^(need v20+^).
echo.
set /p CONFIRM="  Allow automatic Node.js upgrade? [Y/N]: "
if /i "%CONFIRM%" NEQ "Y" (
  echo.
  echo   Please upgrade Node.js at https://nodejs.org
  pause
  exit /b 1
)

:do_install
echo.
echo   → Attempting installation via winget...
winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo   ✓ Installed via winget
  :: Refresh PATH
  for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
  for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%B"
  set "PATH=%SYS_PATH%;%USR_PATH%"
  goto :check_after_install
)

echo   → winget failed, trying PowerShell installer...
powershell -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; $url='https://nodejs.org/dist/latest-v20.x/node-v20.19.1-x64.msi'; $out='%TEMP%\node-install.msi'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process msiexec.exe -Wait -ArgumentList '/I',$out,'/quiet'; Remove-Item $out"

:check_after_install
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   ✗ Automatic installation failed.
  echo   Please install Node.js manually from https://nodejs.org
  echo   Then restart this launcher.
  pause
  exit /b 1
)
echo   ✓ Node.js installed successfully!

:: ── Start server ──────────────────────────────────────────────────────────────
:start_server
echo   → Starting advisor server...
echo   → Browser will open automatically at http://localhost:3131
echo   → Close this window to stop the server
echo.

cd /d "%~dp0"
npm start

pause
