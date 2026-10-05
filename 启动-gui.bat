@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM =====================================================
REM   tju-code GUI launcher.
REM   Uses dist if available, otherwise falls back to source.
REM   Edit the CONFIG block below to match your setup.
REM =====================================================

REM --- User config ---
REM  API_KEY / BASE_URL / MODEL 只在首次双击时导入成本机接口配置
REM  (数据目录下的 providers.json + secrets.json，默认 ~/.tju-code)；
REM  之后以界面「设置 - 接口」为准，在这里改动不会覆盖界面上已改过的值。
REM  留空也能启动，进界面里配置即可。
REM
REM  PORTABLE=1 时数据目录改为本目录下的 data\（U 盘便携：拷走整个文件夹即
REM  带走接口配置、会话与日志）；自更新只替换 dist\，永远不碰 data\。
set "PORTABLE="
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

REM Portable mode: keep data next to this script
set "DATA_DIR=%~dp0data"
if /i "!PORTABLE!"=="1" if not exist "!DATA_DIR!" mkdir "!DATA_DIR!"
if /i "!PORTABLE!"=="1" set "TJU_CODE_HOME=!DATA_DIR!"
if /i "!PORTABLE!"=="1" echo [info] Portable mode, data dir: !DATA_DIR!

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

if exist "%~dp0dist\cli.js" (
  echo Starting tju-code [gui] from dist ...
  node "%~dp0dist\cli.js" gui !ARGS!
) else (
  echo dist not found, running from source ...
  call npx tsx "%~dp0src\cli.ts" gui !ARGS!
)

echo.
echo Done.
pause
