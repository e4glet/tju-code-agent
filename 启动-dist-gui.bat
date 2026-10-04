@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM =====================================================
REM   tju-code GUI launcher (dist only).
REM   Edit the CONFIG block below to match your setup.
REM =====================================================

REM --- User config ---
set "API_KEY="
set "BASE_URL="
set "MODEL="
set "WORKDIR="
set "PORT=9399"
set "UPDATE_URL=https://www.e4glet.cn/tju_code/update"
REM =====================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node ^>= 20 first.
  pause
  exit /b 1
)

if not exist "%~dp0dist\cli.js" (
  echo [ERROR] dist\cli.js not found. Run "npm run build" first.
  pause
  exit /b 1
)

REM Auto-detect API type from BASE_URL
set "API=openai-completions"
if not "%BASE_URL%"=="" (
  echo %BASE_URL% | findstr /i "anthropic" >nul && set "API=anthropic-messages"
)

if not "%WORKDIR%"=="" cd /d "%WORKDIR%"

set "ARGS="
if not "!API!"==""       set "ARGS=!ARGS! --api !API!"
if not "!API_KEY!"==""   set "ARGS=!ARGS! --api-key !API_KEY!"
if not "!BASE_URL!"==""  set "ARGS=!ARGS! --base-url !BASE_URL!"
if not "!MODEL!"==""     set "ARGS=!ARGS! --model !MODEL!"
if not "!UPDATE_URL!"=="" set "ARGS=!ARGS! --update-url !UPDATE_URL!"
if not "!PORT!"==""      set "ARGS=!ARGS! --port !PORT!"

echo Starting tju-code [gui] ...
node "%~dp0dist\cli.js" gui !ARGS!

echo.
echo Done.
pause
