#!/usr/bin/env bash
# my-agent launcher (dist only) - GUI mode.
# Runs <script-dir>/dist/cli.js gui. No source fallback.
# Edit the CONFIG block below.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =====================================================
# Preset: deepseek | kimi | qwen | glm | amd
PROFILE="deepseek"

# Leave empty to use preset defaults / environment variables.
API_KEY=""
BASE_URL=""
MODEL=""
# API kind: openai-completions | anthropic-messages. Empty = use PROFILE default.
API=""

# Working directory for the agent; empty = the project root.
WORKDIR=""

# GUI port (used when MODE=gui)
PORT="9399"
# =====================================================

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Install Node >= 20 first."
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/dist/cli.js" ]; then
  echo "[ERROR] dist/cli.js not found. Run \"npm run build\" first."
  exit 1
fi

if [ -n "$WORKDIR" ]; then
  cd "$WORKDIR"
fi

ARGS=()
[ -n "$PROFILE" ] && ARGS+=(--profile "$PROFILE")
[ -n "$API_KEY" ] && ARGS+=(--api-key "$API_KEY")
[ -n "$BASE_URL" ] && ARGS+=(--base-url "$BASE_URL")
[ -n "$MODEL" ] && ARGS+=(--model "$MODEL")
[ -n "$API" ] && ARGS+=(--api "$API")
[ "$PORT" != "" ] && ARGS+=(--port "$PORT")

echo "Starting my-agent [gui] from dist ..."
node "$SCRIPT_DIR/dist/cli.js" gui "${ARGS[@]}"

echo
echo "Done."
