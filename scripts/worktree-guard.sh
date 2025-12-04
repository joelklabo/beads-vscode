#!/usr/bin/env bash
set -euo pipefail

GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "$(pwd)/.git")
if [[ "$GIT_COMMON_DIR" == ".git" ]]; then
  REPO_ROOT=$(pwd)
else
  REPO_ROOT=$(echo "$GIT_COMMON_DIR" | sed 's/\/\.git$//')
fi

BEADS_DIR="${BEADS_DIR:-${REPO_ROOT}/.beads}"
LOCK_FILE="${BEADS_DIR}/worktrees.lock"
NODE_BIN=${NODE_BIN:-node}
WORKTREE_HELPER="${REPO_ROOT}/out/worktree.js"

log() { [[ "${QUIET:-0}" == "1" ]] || echo "$*"; }
err() { echo "$*" >&2; }

acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    flock -w 5 "$LOCK_FILE" "$@" || {
      err "worktree-guard: failed to acquire lock $LOCK_FILE"
      exit 1
    }
    return
  fi

  rm -rf "$LOCK_FILE.d" 2>/dev/null || true
  local start=$SECONDS
  while ! mkdir "$LOCK_FILE.d" 2>/dev/null; do
    if (( SECONDS - start > 5 )); then
      err "worktree-guard: failed to acquire lock $LOCK_FILE"
      exit 1
    fi
    sleep 0.1
  done
  "$@"
  rmdir "$LOCK_FILE.d" 2>/dev/null || true
}

run_guard() {
  if [[ ! -f "$WORKTREE_HELPER" ]]; then
    err "worktree-guard: helper not built (missing out/worktree.js). Run npm run compile."
    exit 1
  fi

  QUIET=${QUIET:-0} BEADS_DIR="$BEADS_DIR" REPO_ROOT="$REPO_ROOT" "$NODE_BIN" <<'NODE'
const fs = require('fs');
const path = require('path');

const repo = process.env.REPO_ROOT;
const helperPath = path.join(repo, 'out', 'worktree.js');
const { syncRegistry } = require(helperPath);

const registry = syncRegistry(repo);

const issues = [];

for (const entry of registry.entries) {
  if (!/worktrees\//.test(entry.path)) {
    continue; // ignore main repo entry
  }

  const match = entry.path.match(/worktrees\/([^/]+)\/([^/]+)$/);
  const derivedId = match ? `${match[1]}/${match[2]}` : null;
  if (!derivedId) {
    issues.push(`Missing canonical id for path ${entry.path}`);
    continue;
  }
  if (entry.branch && entry.branch.startsWith('refs/heads/')) {
    entry.branch = entry.branch.replace('refs/heads/', '');
  }
  if (entry.id && entry.id !== derivedId) {
    issues.push(`Id mismatch: entry.id=${entry.id} pathId=${derivedId}`);
  }
  if (entry.branch && entry.branch !== derivedId) {
    issues.push(`Branch mismatch: ${entry.branch} != ${derivedId}`);
  }
  entry._derivedId = derivedId;
}

// Duplicate detection by derivedId
const byId = registry.entries.reduce((acc, e) => {
  const id = e._derivedId || e.id;
  if (!id) return acc;
  acc[id] = acc[id] || [];
  acc[id].push(e);
  return acc;
}, {});

for (const [id, list] of Object.entries(byId)) {
  if (list.length > 1) {
    const paths = list.map((e) => e.path).join(', ');
    issues.push(`Duplicate worktrees for ${id}: ${paths}`);
  }
}

if (issues.length) {
  for (const msg of issues) {
    console.error(msg);
  }
  process.exit(1);
}

if (process.env.QUIET !== '1') {
  console.log('worktree-guard: ok');
}
NODE
}

if [[ "${SKIP_GUARD:-0}" == "1" ]]; then
  exit 0
fi

acquire_lock run_guard
