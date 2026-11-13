@echo off
title DL Automation Bot & Admin Portal
cd /d "%~dp0"

echo ========================================================
echo        DL AUTOMATION BOT & ADMIN DASHBOARD
echo ========================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please download and install Node.js (LTS) from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check and auto-install npm packages
if not exist "node_modules\" (
    echo [*] First time setup: Installing npm packages...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [*] Packages installed successfully!
    echo.
)

:: 3. Check and install Playwright Chromium
if not exist "%LOCALAPPDATA%\ms-playwright\" (
    echo [*] Setting up Playwright Chromium browser...
    call npx playwright install chromium
    echo [*] Playwright browser installed!
    echo.
)

:: 4. Launch Bot (which also starts Admin Server & auto-creates .env)
echo [*] Starting Bot and Admin Server...
echo [*] Admin Dashboard: http://localhost:3000/login
echo [*] Username: admin  |  Password: admin123
echo.
node bot.js

pause
