@echo off
setlocal EnableDelayedExpansion

title Copy SSC Attendance dist-iis to IIS

:: Check for Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\" %*\"' -Verb RunAs" 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Must run as Administrator to write to C:\inetpub\wwwroot.
        echo Please right-click this script and select 'Run as administrator'.
        pause
    )
    exit /b
)

:: Detect Source Folder
set "SRC_DIR="
if exist "C:\Users\Ace\Desktop\project-cueare\server\dist-iis" (
    set "SRC_DIR=C:\Users\Ace\Desktop\project-cueare\server\dist-iis"
) else if exist "%~dp0server\dist-iis" (
    set "SRC_DIR=%~dp0server\dist-iis"
) else if exist "%~dp0dist-iis" (
    set "SRC_DIR=%~dp0dist-iis"
)

if "%SRC_DIR%"=="" (
    echo [ERROR] Could not find dist-iis folder!
    echo Looked in:
    echo   - C:\Users\Ace\Desktop\project-cueare\server\dist-iis
    echo   - %~dp0server\dist-iis
    echo.
    echo Run deploy-iis.bat first to build dist-iis.
    pause
    exit /b 1
)

:: Target Folder
set "TARGET_DIR=C:\inetpub\wwwroot\ssc_attendance"
if not "%~1"=="" set "TARGET_DIR=%~1"

echo ===================================================
echo     Direct Copy dist-iis to IIS
echo ===================================================
echo Source: %SRC_DIR%\*
echo Target: %TARGET_DIR%\
echo.

:: 1. Ensure C:\bun\bun.exe exists
if not exist "C:\bun\bun.exe" (
    mkdir "C:\bun" 2>nul
    if exist "%USERPROFILE%\.bun\bin\bun.exe" (
        copy /Y "%USERPROFILE%\.bun\bin\bun.exe" "C:\bun\bun.exe" >nul
    )
)
icacls "C:\bun" /grant "IIS_IUSRS":(OI)(CI)RX /T /Q >nul 2>&1

:: 2. Prepare target directory
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

:: Backup existing target .env
if exist "%TARGET_DIR%\.env" (
    copy /Y "%TARGET_DIR%\.env" "%TEMP%\ssc_attendance_env.bak" >nul
)

:: 3. Robocopy files
echo Copying files to %TARGET_DIR%...
robocopy "%SRC_DIR%" "%TARGET_DIR%" /E /NP /R:2 /W:1 /XF .env >nul
set ROBO_CODE=%ERRORLEVEL%
if %ROBO_CODE% geq 8 (
    echo [ERROR] Robocopy failed with code %ROBO_CODE%
    pause
    exit /b %ROBO_CODE%
)

:: Restore target .env
if exist "%TEMP%\ssc_attendance_env.bak" (
    copy /Y "%TEMP%\ssc_attendance_env.bak" "%TARGET_DIR%\.env" >nul
    del "%TEMP%\ssc_attendance_env.bak" >nul
    echo Preserved existing .env file.
) else (
    if not exist "%TARGET_DIR%\.env" (
        if exist "%SRC_DIR%\.env" copy /Y "%SRC_DIR%\.env" "%TARGET_DIR%\.env" >nul
    )
)

:: 4. Set IIS_IUSRS permissions
echo Setting NTFS permissions for IIS_IUSRS...
if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs"
if not exist "%TARGET_DIR%\.iis-tmp" mkdir "%TARGET_DIR%\.iis-tmp"

icacls "%TARGET_DIR%" /grant "IIS_IUSRS":(OI)(CI)RX /T /Q >nul 2>&1
icacls "%TARGET_DIR%\logs" /grant "IIS_IUSRS":(OI)(CI)M /T /Q >nul 2>&1
icacls "%TARGET_DIR%\.iis-tmp" /grant "IIS_IUSRS":(OI)(CI)M /T /Q >nul 2>&1

:: 5. Restart IIS
echo Restarting IIS...
iisreset /noforce

echo.
echo ===================================================
echo Done! Files copied and IIS restarted.
echo Check: http://localhost/
echo Logs:  %TARGET_DIR%\logs\stdout*.log
echo ===================================================
echo.
pause
