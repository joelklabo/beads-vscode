#!/usr/bin/env bash
set -euo pipefail

GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "$(pwd)/.git")
if [[ "$GIT_COMMON_DIR" == ".git" ]]; then
  REPO_ROOT=$(pwd)
else
  REPO_ROOT=$(echo "$GIT_COMMON_DIR" | sed 's/\/\.git$//')
fi

BEADS_DIR="${BEADS_DIR:-${REPO_ROOT}/.beads}"
REGISTRY_FILE="${BEADS_DIR}/worktrees.json"
LOCK_FILE="${BEADS_DIR}/worktrees.lock"
NODE_BIN=${NODE_BIN:-node}
WORKTREE_HELPER="${REPO_ROOT}/out/worktree.js"
FORMAT=${FORMAT:-text}
AUTO_FIX=${AUTO_FIX:-0}

err() { echo "$*" >&2; }

lock() {
  if command -v flock >/dev/null 2>&1; then
    flock -w 5 "$LOCK_FILE" "$@"
  else
    rm -rf "$LOCK_FILE.d" 2>/dev/null || true
    local start=$SECONDS
    while ! mkdir "$LOCK_FILE.d" 2>/dev/null; do
      if (( SECONDS - start > 5 )); then
        err "worktree-audit: failed to acquire lock"
        exit 1
      fi
      sleep 0.1
    done
    "$@"
    rmdir "$LOCK_FILE.d" 2>/dev/null || true
  fi
}

run_node() {
  if [[ ! -f "$WORKTREE_HELPER" ]]; then
    err "worktree-audit: helper not built (out/worktree.js missing). Run npm run compile."
    exit 1
  fi

  BEADS_DIR="$BEADS_DIR" REPO_ROOT="$REPO_ROOT" FORMAT="$FORMAT" AUTO_FIX="$AUTO_FIX" "$NODE_BIN" <<'NODE'
const fs = require('fs');
const path = require('path');

const repo = process.env.REPO_ROOT;
const helper = require(path.join(repo, 'out', 'worktree.js'));
const format = process.env.FORMAT || 'text';
const autoFix = process.env.AUTO_FIX === '1';

const registryPath = helper.registryPath(repo);
const staleMs = 5 * 60 * 1000;
const now = Date.now();

const registry = helper.readRegistry(repo) || { entries: [], schemaVersion: 1, generatedAt: now };
const fresh = helper.buildRegistryFromGit(repo, now);

const issues = [];
const actions = [];

const pathSet = new Set(fresh.entries.map(e => e.path));

// Stale registry entries
for (const entry of registry.entries) {
  if (!pathSet.has(entry.path)) {
    issues.push({ type: 'missing_path', path: entry.path, id: entry.id });
    if (autoFix) actions.push({ action: 'prune_entry', path: entry.path });
  }
}

// Duplicates in fresh scan
const byId = {};
for (const entry of fresh.entries) {
  const match = entry.path.match(/worktrees\/([^/]+)\/([^/]+)$/);
  const derivedId = match ? `${match[1]}/${match[2]}` : null;
  const id = derivedId || entry.id || entry.branch;
  if (!id) {
    issues.push({ type: 'unknown_id', path: entry.path });
    continue;
  }
  entry.id = id;
  byId[id] = byId[id] || [];
  byId[id].push(entry);
}

for (const [id, list] of Object.entries(byId)) {
  if (list.length > 1) {
    issues.push({ type: 'duplicate', id, paths: list.map(e => e.path) });
  }
}

if (autoFix) {
  const prunedEntries = fresh.entries.filter(e => !issues.find(i => i.type === 'missing_path' && i.path === e.path));
  helper.writeRegistry(repo, { ...fresh, entries: prunedEntries });
} else {
  helper.writeRegistry(repo, fresh);
}

if (format === 'json') {
  console.log(JSON.stringify({ issues, actions, registry: fresh }, null, 2));
  process.exit(issues.length ? 1 : 0);
}

if (issues.length === 0) {
  console.log('worktree-audit: ok');
  process.exit(0);
}

console.log('worktree-audit: issues found');
for (const issue of issues) {
  if (issue.type === 'missing_path') {
    console.log(`- missing path: ${issue.path} (id=${issue.id || 'n/a'})`);
  } else if (issue.type === 'duplicate') {
    console.log(`- duplicate id ${issue.id}: ${issue.paths.join(', ')}`);
  } else if (issue.type === 'unknown_id') {
    console.log(`- unknown id for path ${issue.path}`);
  }
}
process.exit(1);
NODE
}

lock run_node
