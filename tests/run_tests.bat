@echo off
echo ═══════════════════════════════════════════════════
echo   CCF Booking System — Automated Test Runner
echo ═══════════════════════════════════════════════════
echo.

cd /d "%~dp0"

echo [1/3] Checking Python...
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    pause
    exit /b 1
)

echo.
echo [2/3] Running tests...
echo.
python -m pytest --html=report.html --self-contained-html -v --tb=short %*
echo.

echo [3/3] Opening report...
if exist report.html (
    start report.html
    echo Report opened in your default browser.
) else (
    echo WARNING: report.html was not generated.
)

echo.
echo ═══════════════════════════════════════════════════
echo   Test run complete!
echo ═══════════════════════════════════════════════════
pause
