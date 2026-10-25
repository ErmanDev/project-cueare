@echo off
setlocal EnableDelayedExpansion

title Deploy SSC QR Attendance to IIS

:: Check for Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\" %*\"' -Verb RunAs" 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Must run as Administrator to write to C:\inetpub\wwwroot.
        echo Please right-click deploy-iis.bat and select 'Run as administrator'.
        pause
    )
    exit /b
)

:: Get Project Paths
set "ROOT_DIR=%~dp0"
set "SERVER_DIR=%ROOT_DIR%server"
set "DIST_DIR=%SERVER_DIR%\dist-iis"

:: Check Desktop alternate path if running from elsewhere or if Desktop path specified
if not exist "%SERVER_DIR%" (
    if exist "C:\Users\Ace\Desktop\project-cueare\server" (
        set "ROOT_DIR=C:\Users\Ace\Desktop\project-cueare\"
        set "SERVER_DIR=C:\Users\Ace\Desktop\project-cueare\server"
        set "DIST_DIR=C:\Users\Ace\Desktop\project-cueare\server\dist-iis"
    )
)

:: Target IIS Directory (default: C:\inetpub\wwwroot\ssc_attendance or passed as %1)
set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="" (
    set "TARGET_DIR=C:\inetpub\wwwroot\ssc_attendance"
)

echo ===================================================
echo     SSC QR Attendance - Direct IIS Deployment
echo ===================================================
echo Root Dir:   %ROOT_DIR%
echo Target IIS: %TARGET_DIR%
echo.

:: 1. Ensure Bun is available at C:\bun\bun.exe for IIS
echo [1/6] Checking Bun runtime...
if not exist "C:\bun\bun.exe" (
    echo Creating C:\bun directory...
    mkdir "C:\bun" 2>nul
    if exist "%USERPROFILE%\.bun\bin\bun.exe" (
        copy /Y "%USERPROFILE%\.bun\bin\bun.exe" "C:\bun\bun.exe" >nul
        echo Copied bun.exe from user profile to C:\bun\bun.exe
    ) else (
        where bun.exe >nul 2>&1
        if %ERRORLEVEL% equ 0 (
            for /f "delims=" %%I in ('where bun.exe') do (
                copy /Y "%%I" "C:\bun\bun.exe" >nul
                goto :bun_found
            )
        ) else (
            echo [ERROR] bun.exe not found! Please install Bun runtime first.
            pause
            exit /b 1
        )
    )
)
:bun_found
icacls "C:\bun" /grant "IIS_IUSRS":(OI)(CI)RX /T /Q >nul 2>&1
echo [OK] Bun ready at C:\bun\bun.exe

:: 2. Build deployment package
echo.
echo [2/6] Building web UI and packaging server...
cd /d "%SERVER_DIR%"
call bun run build:iis
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed! Check errors above.
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Stop IIS website or app pool temporarily to prevent locked files
echo.
echo [3/6] Preparing destination folder...
if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%"
)

:: Backup existing target .env if it exists
if exist "%TARGET_DIR%\.env" (
    copy /Y "%TARGET_DIR%\.env" "%TEMP%\ssc_attendance_env.bak" >nul
)

:: 4. Copy files to IIS directory
echo.
echo [4/6] Copying package files to %TARGET_DIR%...
robocopy "%DIST_DIR%" "%TARGET_DIR%" /E /NP /R:2 /W:1 /XF .env >nul
set ROBO_CODE=%ERRORLEVEL%
if %ROBO_CODE% geq 8 (
    echo [ERROR] Robocopy failed with code %ROBO_CODE%
    pause
    exit /b %ROBO_CODE%
)

:: Restore existing target .env or copy default from package
if exist "%TEMP%\ssc_attendance_env.bak" (
    copy /Y "%TEMP%\ssc_attendance_env.bak" "%TARGET_DIR%\.env" >nul
    del "%TEMP%\ssc_attendance_env.bak" >nul
    echo Preserved existing .env configuration.
) else (
    if not exist "%TARGET_DIR%\.env" (
        if exist "%DIST_DIR%\.env" (
            copy /Y "%DIST_DIR%\.env" "%TARGET_DIR%\.env" >nul
        )
    )
)

:: 5. Ensure logs / .iis-tmp folders and set permissions for IIS
echo.
echo [5/6] Setting NTFS permissions for IIS_IUSRS...
if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs"
if not exist "%TARGET_DIR%\.iis-tmp" mkdir "%TARGET_DIR%\.iis-tmp"

icacls "%TARGET_DIR%" /grant "IIS_IUSRS":(OI)(CI)RX /T /Q >nul 2>&1
icacls "%TARGET_DIR%\logs" /grant "IIS_IUSRS":(OI)(CI)M /T /Q >nul 2>&1
icacls "%TARGET_DIR%\.iis-tmp" /grant "IIS_IUSRS":(OI)(CI)M /T /Q >nul 2>&1

:: 6. Restart IIS to reload HttpPlatformHandler
echo.
echo [6/6] Restarting IIS services...
iisreset /noforce
if %ERRORLEVEL% neq 0 (
    echo [WARNING] iisreset returned code %ERRORLEVEL%. Please restart IIS manually if needed.
)

echo.
echo ===================================================
echo           Deployment Complete!
echo ===================================================
echo Target Location: %TARGET_DIR%
echo Stdout Logs:     %TARGET_DIR%\logs\stdout*.log
echo.
echo Verify in browser:
echo   - Web Portal: http://localhost/
echo   - API Health: http://localhost/api/health
echo ===================================================
echo.
pause
