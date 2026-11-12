@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py -3"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 is required. Install Python 3 or use the PowerShell instructions in README.md.
    pause
    exit /b 1
  )
  set "PY=python"
)
start "Web Slim local server" cmd /k "%PY% -m http.server 8765 --directory client --bind 127.0.0.1"
timeout /t 2 >nul
start "" "http://127.0.0.1:8765/"
