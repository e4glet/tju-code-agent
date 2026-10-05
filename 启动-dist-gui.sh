#!/usr/bin/env bash
# tju-code GUI launcher (dist only).
# Edit the CONFIG block below to match your setup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =====================================================
# User config
#   API_KEY / BASE_URL / MODEL 只在首次运行时导入成本机接口配置
#   (数据目录下的 providers.json + secrets.json，默认 ~/.tju-code)；
#   之后以界面「设置 - 接口」为准，在这里改动不会覆盖界面上已改过的值。
#   留空也能启动，进界面里配置即可。
#
#   PORTABLE=1 时数据目录改为本目录下的 data/（U 盘便携：拷走整个文件夹即
#   带走接口配置、会话与日志）；自更新只替换 dist/，永远不碰 data/。
PORTABLE=""
API_KEY=""
BASE_URL=""
MODEL=""
WORKDIR=""
PORT="9399"
UPDATE_URL="https://www.e4glet.cn/tju_code/update"
# =====================================================

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Install Node >= 20 first."
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/dist/cli.js" ]; then
  echo "[ERROR] dist/cli.js not found. Run \"npm run build\" first."
  exit 1
fi

# Portable mode: keep data next to this script
if [ "$PORTABLE" = "1" ]; then
  mkdir -p "$SCRIPT_DIR/data"
  export TJU_CODE_HOME="$SCRIPT_DIR/data"
  echo "[info] Portable mode, data dir: $SCRIPT_DIR/data"
fi

# Auto-detect API type from BASE_URL
API="openai-completions"
if [ -n "$BASE_URL" ]; then
  echo "$BASE_URL" | grep -qi "anthropic" && API="anthropic-messages"
fi

if [ -n "$WORKDIR" ]; then
  cd "$WORKDIR"
fi

ARGS=()
[ -n "$API" ]      && ARGS+=(--api "$API")
[ -n "$API_KEY" ]  && ARGS+=(--api-key "$API_KEY")
[ -n "$BASE_URL" ] && ARGS+=(--base-url "$BASE_URL")
[ -n "$MODEL" ]    && ARGS+=(--model "$MODEL")
[ -n "$UPDATE_URL" ] && ARGS+=(--update-url "$UPDATE_URL")
[ -n "$PORT" ]     && ARGS+=(--port "$PORT")

echo "Starting tju-code [gui] ..."
node "$SCRIPT_DIR/dist/cli.js" gui "${ARGS[@]}"

echo
echo "Done."
