#!/usr/bin/env bash
set -euo pipefail

# Make the main working tree read-only to prevent accidental edits.
# Unlock requires ALLOW_MAIN_WRITE=1 in the environment.

ROOT="${PROTECT_TARGET:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE="${1:-}"

if [[ -z "$MODE" || ( "$MODE" != "lock" && "$MODE" != "unlock" ) ]]; then
  echo "Usage: $0 <lock|unlock> [target-root]" >&2
  exit 1
fi

if [[ "$MODE" == "unlock" && "${ALLOW_MAIN_WRITE:-0}" != "1" ]]; then
  echo "Refusing to unlock main. Set ALLOW_MAIN_WRITE=1 to proceed." >&2
  exit 1
fi

if [[ ! -d "$ROOT/.git" ]]; then
  echo "Target does not look like a git repo: $ROOT" >&2
  exit 1
fi

PRUNE_ARGS=(
  -path "$ROOT/.git" -prune -o
  -path "$ROOT/.beads" -prune -o
  -path "$ROOT/worktrees" -prune -o
  -path "$ROOT/node_modules" -prune -o
  -path "$ROOT/.vscode" -prune
)

lock_tree() {
  find "$ROOT" \( "${PRUNE_ARGS[@]}" \) -o -type f -print0 | xargs -0 chmod a-w -- 2>/dev/null || true
  find "$ROOT" \( "${PRUNE_ARGS[@]}" \) -o -type d -print0 | xargs -0 chmod a-w -- 2>/dev/null || true
}

unlock_tree() {
  find "$ROOT" \( "${PRUNE_ARGS[@]}" \) -o -type f -print0 | xargs -0 chmod u+w -- 2>/dev/null || true
  find "$ROOT" \( "${PRUNE_ARGS[@]}" \) -o -type d -print0 | xargs -0 chmod u+w -- 2>/dev/null || true
}

case "$MODE" in
  lock)
    lock_tree
    ;;
  unlock)
    unlock_tree
    ;;
esac
