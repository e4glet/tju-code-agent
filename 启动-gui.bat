@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM =====================================================
REM  my-agent one-click launcher
REM  Edit the CONFIG block below to match your setup.
REM =====================================================

REM Preset: deepseek | kimi | qwen | glm | amd
REM Leave empty to fall back to OPENAI_API_KEY env.
set "PROFILE=deepseek"

REM Leave empty to use the preset defaults / environment variables.
set "API_KEY="
set "BASE_URL="
set "MODEL="

REM API kind: openai-completions | anthropic-messages. Empty = use PROFILE default.
set "API="

REM MODE: chat (terminal) or gui (browser)
set "MODE=chat"

REM Working directory for the agent; empty means the script folder.
set "WORKDIR="

REM GUI port (used when MODE=gui)
set "PORT=9399"
REM =====================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node ^>= 20 first.
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
if "!MODE!"=="gui"      set "ARGS=!ARGS! --port !PORT!"

if exist "%~dp0dist\cli.js" (
  echo Starting my-agent [%MODE%] ...
  node "%~dp0dist\cli.js" gui %MODE% !ARGS!
) else (
  echo dist not found, running from source ...
  call npx tsx "%~dp0src\cli.ts" !MODE! !ARGS!
)

echo.
echo Done.
pause