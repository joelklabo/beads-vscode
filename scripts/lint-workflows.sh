#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$SCRIPT_DIR/../node_modules/.bin/actionlint"
if [[ ! -x "$BIN" ]]; then
  echo "actionlint not found; downloading 1.6.25..."
  curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash \
    | bash -s -- -b "$SCRIPT_DIR/../node_modules/.bin" 1.6.25
fi
"$BIN" -color
