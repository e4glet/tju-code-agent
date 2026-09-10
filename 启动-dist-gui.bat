@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM =====================================================
REM   my-agent launcher (dist only).
REM   Runs %~dp0dist\cli.js. No source fallback.
REM   Edit the CONFIG block below.
REM =====================================================

REM Preset: deepseek | kimi | qwen | glm | amd
set "PROFILE=deepseek"

REM Leave empty to use preset defaults / environment variables.
set "API_KEY="
set "BASE_URL="
set "MODEL="

REM API kind: openai-completions | anthropic-messages. Empty = use PROFILE default.
set "API="

REM Working directory for the agent; empty = the project root.
set "WORKDIR="

REM GUI port
set "PORT=9399"
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

if not "%WORKDIR%"=="" cd /d "%WORKDIR%"

set "ARGS="
if not "!PROFILE!"=="" set "ARGS=!ARGS! --profile !PROFILE!"
if not "!API_KEY!"==""  set "ARGS=!ARGS! --api-key !API_KEY!"
if not "!BASE_URL!"=="" set "ARGS=!ARGS! --base-url !BASE_URL!"
if not "!MODEL!"==""    set "ARGS=!ARGS! --model !MODEL!"
if not "!API!"==""       set "ARGS=!ARGS! --api !API!"
if not "!PORT!"==""      set "ARGS=!ARGS! --port !PORT!"

echo Starting my-agent [gui] from dist ...
node "%~dp0dist\cli.js" gui !ARGS!

echo.
echo Done.
pause