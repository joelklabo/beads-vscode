#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$ROOT_DIR/tmp"
PATTERN="beady-*"
AGE_DAYS=${CLEAN_AGE_DAYS:-1}

if [[ ! -d "$TMP_DIR" ]]; then
  echo "No tmp directory found at $TMP_DIR; nothing to clean." >&2
  exit 0
fi

find "$TMP_DIR" -maxdepth 1 -type d -name "$PATTERN" -mtime +"$AGE_DAYS" -print -exec rm -rf {} +
