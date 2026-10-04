#!/usr/bin/env bash
# tju-code GUI launcher (dist only).
# Edit the CONFIG block below to match your setup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =====================================================
# User config
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
