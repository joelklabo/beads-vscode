#!/usr/bin/env bash
set -euo pipefail

ROOT="$(dirname "$0")/.."
cd "$ROOT"

# Expect failure when helper is missing
if ./scripts/worktree-guard.sh >/dev/null 2>&1; then
  echo "Expected guard to fail without out/worktree.js" >&2
  exit 1
fi

echo "ok: guard fails without helper" >&2
