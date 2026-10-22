@echo off
rem Build the Python worker and start SpineSlim.
rem Usage: build_and_run.bat            -> dev mode (tauri dev)
rem        build_and_run.bat package    -> release installer (tauri build)

setlocal
cd /d "%~dp0"

set "MODE=%~1"

where python >nul 2>&1 || (echo [error] Python not found in PATH. & goto :fail)
where node >nul 2>&1 || (echo [error] Node.js not found in PATH. & goto :fail)
where npm >nul 2>&1 || (echo [error] npm not found in PATH. & goto :fail)
where cargo >nul 2>&1 || (echo [error] Rust toolchain ^(cargo^) not found in PATH. & goto :fail)

echo [1/4] Installing Python dependencies...
python -m pip install -r requirements.txt || goto :fail

echo [2/4] Installing Node dependencies...
if not exist node_modules (
    call npm install || goto :fail
) else (
    echo node_modules already present, skipping npm install.
)

echo [3/4] Building worker...
python scripts\build_worker.py || goto :fail

echo [4/4] Starting SpineSlim...
if /i "%MODE%"=="package" (
    call npm run package || goto :fail
) else (
    call npm run desktop || goto :fail
)

goto :end

:fail
echo.
echo Build or start failed. See the messages above.
pause
exit /b 1

:end
endlocal
