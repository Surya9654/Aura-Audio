@echo off
setlocal
echo ========================================================
echo   Aura Audio - Windows 11 Widget Registration
echo ========================================================

set "OUT_DIR=%~dp0bin\Release\net8.0-windows10.0.19041.0\win-x64"

if not exist "%OUT_DIR%\AuraWidgetProvider.exe" (
    echo [ERROR] AuraWidgetProvider.exe not found.
    echo Please run build.bat first to compile the project.
    pause
    exit /b 1
)

echo [1/2] Syncing manifest and templates...
copy /Y "%~dp0Package.appxmanifest" "%OUT_DIR%\AppxManifest.xml" >nul

echo [2/2] Registering Aura Widget Provider with Windows 11...
powershell -ExecutionPolicy Bypass -Command "Add-AppxPackage -Register '%OUT_DIR%\AppxManifest.xml'"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo =========================================================================
    echo [IMPORTANT] Windows requires Developer Mode enabled to register widgets.
    echo Opening Windows Settings... Please toggle [Developer Mode] to ON.
    echo Once enabled, run register.bat again!
    echo =========================================================================
    start ms-settings:developers
    pause
    exit /b 1
)

echo.
echo ========================================================
echo [SUCCESS] Aura Lossless Audio Widget registered!
echo 1. Press Win + W to open the Widgets Board.
echo 2. Click [+] (Add widget).
echo 3. Select 'Aura Lossless Now Playing' and click Pin.
echo ========================================================
pause
