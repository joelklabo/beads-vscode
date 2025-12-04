#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
BEADS_DIR="${BEADS_DIR:-${REPO_ROOT}/.beads}"
export BEADS_DIR
export BEADS_NO_DAEMON=1

GUARD="${REPO_ROOT}/scripts/worktree-guard.sh"
BD_BIN=${BD_BIN:-npx bd}

is_mutation() {
  local cmd="$1"
  case "$cmd" in
    create|update|close|label|delete|open|edit|comment) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ $# -gt 0 ]] && is_mutation "$1"; then
  SKIP_GUARD=${SKIP_GUARD:-0} QUIET=1 "$GUARD"
fi

exec $BD_BIN "$@"
