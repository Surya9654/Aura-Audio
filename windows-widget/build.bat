@echo off
setlocal
echo ========================================================
echo   Aura Audio - Windows 11 Widget Provider Build Script
echo ========================================================

set "DOTNET_CMD=dotnet"
where dotnet >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "%LocalAppData%\Microsoft\dotnet\dotnet.exe" (
        set "DOTNET_CMD=%LocalAppData%\Microsoft\dotnet\dotnet.exe"
    ) else (
        echo [ERROR] .NET SDK is not installed or not in PATH.
        echo Please install .NET 8 SDK from: https://dotnet.microsoft.com/download/dotnet/8.0
        pause
        exit /b 1
    )
)

echo [1/3] Restoring NuGet dependencies...
"%DOTNET_CMD%" restore "%~dp0AuraWidgetProvider.csproj"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to restore NuGet dependencies.
    pause
    exit /b 1
)

echo [2/3] Building AuraWidgetProvider (Release x64)...
"%DOTNET_CMD%" build "%~dp0AuraWidgetProvider.csproj" -c Release -r win-x64 --no-restore
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

set "OUT_DIR=%~dp0bin\Release\net8.0-windows10.0.19041.0\win-x64"
copy /Y "%~dp0Package.appxmanifest" "%OUT_DIR%\AppxManifest.xml" >nul

echo [3/3] Build completed successfully!
echo Binary located at: %OUT_DIR%\AuraWidgetProvider.exe
echo.
echo Attempting to register widget package with Windows 11...
powershell -ExecutionPolicy Bypass -Command "Add-AppxPackage -Register '%OUT_DIR%\AppxManifest.xml'"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo =========================================================================
    echo [ACTION REQUIRED] Windows requires Developer Mode to register local widgets.
    echo Opening Settings... Please toggle [Developer Mode] to ON, then run register.bat!
    echo =========================================================================
    start ms-settings:developers
) else (
    echo.
    echo [SUCCESS] Aura Lossless Audio Widget registered!
    echo Press Win + W to view it in the Windows 11 Widget Board.
)
pause
