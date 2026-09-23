#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FALLBACK_NODE="/Users/jm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "$FALLBACK_NODE" ]; then
  NODE_BIN="$FALLBACK_NODE"
else
  echo "Node.js 18 or newer is required." >&2
  exit 1
fi

exec "$NODE_BIN" "$ROOT_DIR/server/src/index.mjs"

