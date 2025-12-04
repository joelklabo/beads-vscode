#!/bin/bash
# task-worktree.sh - Helper script for multi-agent task workflow using git worktrees
# Usage: ./scripts/task-worktree.sh <command> <worker-name> [task-id]
#
# Git worktrees give each agent their own isolated working directory,
# preventing file conflicts when multiple agents work simultaneously.
#
# Commands:
#   start <worker> <task-id>  - Create worktree and start task
#   finish <worker> <task-id> - Merge worktree back to main and clean up
#   status                    - Show all worktrees and their status
#   cleanup <worker>          - Remove all worktrees for a worker
#   list                      - List all active worktrees

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Default lock timeout (seconds) unless overridden per-call
LOCK_TIMEOUT_DEFAULT="${LOCK_TIMEOUT_SECONDS:-10}"
CLAIM_LOCK_TIMEOUT_DEFAULT="${CLAIM_LOCK_TIMEOUT_SECONDS:-5}"
HEARTBEAT_INTERVAL_DEFAULT="${HEARTBEAT_INTERVAL_SECONDS:-${HEARTBEAT_INTERVAL:-60}}"
HEARTBEAT_STALE_DEFAULT="${HEARTBEAT_STALE_SECONDS:-180}"
LOCK_BACKEND="flock"

detect_lock_backend() {
  if command -v flock >/dev/null 2>&1; then
    LOCK_BACKEND="flock"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    LOCK_BACKEND="python"
    log_warn "flock not found; falling back to python3 fcntl-based locking"
    return
  fi

  LOCK_BACKEND="mkdir"
  log_warn "No flock/python3 available; using mkdir-based advisory locks"
}

init_env() {
  if [[ -z "$MAIN_REPO" ]]; then
    MAIN_REPO=$(get_main_repo)
  fi

  : "${BEADS_DIR:=${MAIN_REPO}/.beads}"
  : "${LOCK_DIR:=${BEADS_DIR}/locks}"
  : "${HEARTBEAT_DIR:=${BEADS_DIR}/heartbeats}"

  mkdir -p "$LOCK_DIR" "$HEARTBEAT_DIR"

  export BEADS_DIR
  export BEADS_NO_DAEMON=1

  init_db
}

clean_stale_admin_dirs() {
  local git_common
  git_common=$(git -C "$MAIN_REPO" rev-parse --git-common-dir 2>/dev/null || echo "$MAIN_REPO/.git")

  # Prune git-managed admin directories and drop empty bead admin dirs
  git -C "$MAIN_REPO" worktree prune >/dev/null 2>&1 || true

  for dir in "$git_common/worktrees" "$git_common/beads-worktrees"; do
    [[ -d "$dir" ]] || continue
    find "$dir" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true
  done
}

bd_cmd() {
  init_env
  clean_stale_admin_dirs
  # Guard against duplicate/invalid worktree state before bd mutations
  if [[ -x "${MAIN_REPO}/scripts/worktree-guard.sh" ]]; then
    QUIET=1 "${MAIN_REPO}/scripts/worktree-guard.sh" || {
      log_error "worktree guard failed; fix issues before proceeding"
      exit 1
    }
  fi

  BEADS_DIR="$BEADS_DIR" BEADS_NO_DAEMON=1 npx bd "$@"
}

# Extract a list of files from a task description's "## Files" section
get_task_files() {
  local task_id="$1"
  local task_json desc
  task_json=$(bd_cmd show "$task_id" --json 2>/dev/null || echo '{}')
  desc=$(echo "$task_json" | jq -r '.[0].description // ""' 2>/dev/null || echo "")

  echo "$desc" | awk '
    BEGIN { capture = 0 }
    /^##[[:space:]]*Files/ { capture = 1; next }
    capture {
      if ($0 ~ /^##[[:space:]]+/) { exit }
      if ($0 ~ /^\s*$/) { exit }
      if ($0 ~ /^\s*-/) {
        sub(/^\s*-\s*/, "", $0)
        if (length($0) > 0) print $0
      }
    }
  '
}

# Determine if a candidate task conflicts (overlapping files) with any in-progress task
has_file_conflicts() {
  local candidate="$1"
  local candidate_files inprogress_json conflict=1

  candidate_files=$(get_task_files "$candidate")
  # If the task did not declare files, assume no conflict to avoid starvation
  if [[ -z "$candidate_files" ]]; then
    return 1
  fi

  inprogress_json=$(bd_cmd list --status in_progress --json 2>/dev/null || echo '[]')
  mapfile -t inprogress_ids < <(echo "$inprogress_json" | jq -r '.[].id // empty')

  for ip_id in "${inprogress_ids[@]}"; do
    [[ "$ip_id" == "$candidate" ]] && continue
    ip_files=$(get_task_files "$ip_id")
    [[ -z "$ip_files" ]] && continue
    while IFS= read -r cf; do
      while IFS= read -r ipf; do
        if [[ "$cf" == "$ipf" ]]; then
          return 0
        fi
      done <<<"$ip_files"
    done <<<"$candidate_files"
  done

  return 1
}

cmd_claim_next() {
  local worker="$1"

  if [[ -z "$worker" ]]; then
    echo "Usage: $0 claim-next <worker-name>"
    exit 1
  fi

  init_env
  detect_lock_backend

  local global_lock="${LOCK_DIR}/claim-next.lock"
  local selected=""

  local selection_output status
  set +e
  selection_output=$(with_lock "$global_lock" bash -c '
    set -e
    worker="$1"
    LOCK_DIR="$2"
    BEADS_DIR="$3"
    script="$4"

    ready_json=$(BEADS_DIR="$BEADS_DIR" BEADS_NO_DAEMON=1 npx bd ready --json 2>/dev/null || echo "[]")
    mapfile -t ready_ids < <(echo "$ready_json" | jq -r "sort_by(.priority, .created_at)[]?.id // empty")

    for task_id in "${ready_ids[@]}"; do
      [[ -z "$task_id" ]] && continue

      # Skip if files conflict with in-progress work
      if ! "$script" __has_conflict "$task_id"; then
        claim_lock="${LOCK_DIR}/claim-${task_id}.lock"
        if "$script" __claim_under_lock "$task_id" "$worker" "$claim_lock"; then
          echo "$task_id"
          exit 0
        fi
      fi
    done

    exit 2
  ' bash "$worker" "$LOCK_DIR" "$BEADS_DIR" "$0")
  status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    selected=$(echo "$selection_output" | tail -n1)
  fi

  if [[ -z "$selected" ]]; then
    log_info "No tasks available for claim-next"
    exit 0
  fi

  log_info "Claimed task via claim-next: $selected"
  SKIP_INITIAL_CLAIM=1 TASK_ID="$selected" WORKER="$worker" "$0" start "$worker" "$selected"
  exit $?
}

# Helper entrypoints for subshell use in cmd_claim_next
if [[ "$1" == "__has_conflict" ]]; then
  shift
  task_id="$1"
  if has_file_conflicts "$task_id"; then exit 0; else exit 1; fi
fi

if [[ "$1" == "__claim_under_lock" ]]; then
  shift
  task_id="$1"; worker="$2"; lock_file="$3"
  if LOCK_TIMEOUT="$CLAIM_LOCK_TIMEOUT_DEFAULT" with_lock "$lock_file" claim_task_atomic "$task_id" "$worker"; then
    exit 0
  fi
  exit 1
fi

with_lock() {
  local lockfile="$1"; shift
  local timeout="${LOCK_TIMEOUT:-$LOCK_TIMEOUT_DEFAULT}"
  local quiet="${LOCK_QUIET:-0}"

  mkdir -p "$(dirname "$lockfile")"

  if [[ "$LOCK_BACKEND" == "python" ]]; then
    local ready_file
    ready_file=$(mktemp)

    set +e
    python3 - "$lockfile" "$timeout" "$ready_file" <<'PY' &
import fcntl, os, sys, time, signal

lockfile = sys.argv[1]
timeout = float(sys.argv[2])
ready_path = sys.argv[3]

fd = os.open(lockfile, os.O_CREAT | os.O_RDWR)
start = time.time()

while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if time.time() - start >= timeout:
            sys.exit(95)
        time.sleep(0.1)

with open(ready_path, "w") as f:
    f.write("locked")

signal.signal(signal.SIGTERM, lambda *args: sys.exit(0))
signal.pause()
PY
    local lock_pid=$!
    set -e

    local waited=0
    local acquired=false
    while [[ $waited -lt 100 ]]; do
      if [[ -f "$ready_file" ]]; then
        acquired=true
        break
      fi

      if ! kill -0 "$lock_pid" 2>/dev/null; then
        wait "$lock_pid" 2>/dev/null || true
        break
      fi

      sleep 0.05
      waited=$((waited + 1))
    done

    if [[ "$acquired" != true ]]; then
      [[ "$quiet" != 1 ]] && log_error "Failed to acquire lock: $lockfile (timeout ${timeout}s)"
      wait "$lock_pid" 2>/dev/null || true
      rm -f "$ready_file"
      exit 95
    fi

    "$@"
    local cmd_status=$?

    kill "$lock_pid" 2>/dev/null || true
    wait "$lock_pid" 2>/dev/null || true
    rm -f "$ready_file"

    return $cmd_status
  fi

  if [[ "$LOCK_BACKEND" == "mkdir" ]]; then
    local start_ts=$SECONDS
    local fallback_lock="${lockfile}.dlock"

    while ! mkdir "$fallback_lock" 2>/dev/null; do
      if (( SECONDS - start_ts >= timeout )); then
        [[ "$quiet" != 1 ]] && log_error "Failed to acquire lock: $lockfile (timeout ${timeout}s)"
        return 95
      fi
      sleep 0.2
    done

    set +e
    "$@"
    local cmd_status=$?
    set -e

    rmdir "$fallback_lock" 2>/dev/null || true
    return $cmd_status
  fi

  (
    if ! flock -w "$timeout" 200; then
      [[ "$quiet" != 1 ]] && log_error "Failed to acquire lock: $lockfile (timeout ${timeout}s)"
      exit 95
    fi
    "$@"
  ) 200>"$lockfile"
}

# Add random jitter to prevent thundering herd
add_jitter() {
  local max_ms="${1:-2000}"  # Default 0-2 seconds
  local jitter=$((RANDOM % max_ms))
  sleep "$(echo "scale=3; $jitter/1000" | bc)"
}

enable_sqlite_wal() {
  local db_path="$BEADS_DIR/beads.db"

  if ! command -v sqlite3 >/dev/null 2>&1; then
    log_warn "sqlite3 not found; cannot enforce WAL mode for $db_path"
    return
  fi

  if [[ ! -f "$db_path" ]]; then
    return
  fi

  # Enable WAL and set a generous busy timeout for concurrent readers/writers
  sqlite3 "$db_path" "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;" >/dev/null 2>&1 || \
    log_warn "Could not enable WAL mode on $db_path"

  # Opportunistically checkpoint to keep wal file small
  sqlite3 "$db_path" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
}

init_db() {
  local db_path="$BEADS_DIR/beads.db"

  mkdir -p "$BEADS_DIR"

  # Create database if missing so we can apply WAL pragmas immediately
  if [[ ! -f "$db_path" ]] && command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db_path" "VACUUM;" >/dev/null 2>&1 || true
  fi

  enable_sqlite_wal
}

start_heartbeat() {
  local hb_file="$1"
  local pid_file="$2"
  local interval="${HEARTBEAT_INTERVAL:-$HEARTBEAT_INTERVAL_DEFAULT}"

  mkdir -p "$(dirname "$hb_file")"

  # Stop any existing heartbeat for this worktree
  if [[ -f "$pid_file" ]]; then
    local old_pid
    old_pid=$(cat "$pid_file" 2>/dev/null || echo "")
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      kill "$old_pid" 2>/dev/null || true
    fi
  fi

  echo "worker=$WORKER task=$TASK_ID started=$(date -u +%s)" > "$hb_file"

  ( while true; do
      touch "$hb_file"
      sleep "$interval"
    done ) >/dev/null 2>&1 &

  echo $! > "$pid_file"
}

stop_heartbeat() {
  local hb_file="$1"
  local pid_file="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi

  rm -f "$hb_file"
}

recover_stale_task() {
  local task_id="$1"
  local hb_worker="$2"
  local actor="${WORKER:-${USER:-auto-recover}}"

  init_env

  local lock_file="${LOCK_DIR}/claim-${task_id}.lock"
  LOCK_TIMEOUT="$CLAIM_LOCK_TIMEOUT_DEFAULT" with_lock "$lock_file" \
    bd_cmd update "$task_id" --status open --assignee "" --actor "$actor" >/dev/null 2>&1 || true

  # Remove heartbeat file(s) for this task
  rm -f "${HEARTBEAT_DIR}/${hb_worker}__${task_id}.hb" "${HEARTBEAT_DIR}"/*__"${task_id}".hb 2>/dev/null || true

  # Clean up orphaned worktrees, if any
  local main_repo
  main_repo=$(get_main_repo)
  local wt_pattern="${main_repo}/../worktrees/*/${task_id}"
  for wt in $wt_pattern; do
    if [[ -d "$wt" ]]; then
      log_warn "Removing orphaned worktree: $wt"
      git -C "$main_repo" worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
    fi
  done

  git -C "$main_repo" worktree prune >/dev/null 2>&1 || true
}

sweep_stale_heartbeats() {
  local max_age="${1:-$HEARTBEAT_STALE_DEFAULT}"
  init_env

  local now
  now=$(date +%s)

  shopt -s nullglob
  for hb in "$HEARTBEAT_DIR"/*.hb; do
    local base
    base=$(basename "$hb" .hb)
    local hb_worker="${base%%__*}"
    local hb_task="${base#*__}"

    local mtime
    mtime=$(perl -e 'print((stat shift)[9])' "$hb")
    local age=$(( now - mtime ))

    if (( age > max_age )); then
      log_warn "Stale heartbeat detected (${age}s): worker=$hb_worker task=$hb_task"
      local task_json
      task_json=$(bd_cmd show "$hb_task" --json 2>/dev/null || echo '{}')
      local current_status
      current_status=$(echo "$task_json" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^\"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^\"]*\)".*/\1/' || echo "")
      local current_assignee
      current_assignee=$(echo "$task_json" | grep -oE '"assignee"[[:space:]]*:[[:space:]]*"[^\"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^\"]*\)".*/\1/' || echo "")

      if [[ "$current_status" != "in_progress" ]]; then
        rm -f "$hb"
        continue
      fi

      if [[ -n "$current_assignee" && "$current_assignee" != "$hb_worker" ]]; then
        rm -f "$hb"
        continue
      fi

      recover_stale_task "$hb_task" "$hb_worker"
    fi
  done
  shopt -u nullglob
}

# Verify task is claimable (not already in_progress by another agent)
verify_task_claimable() {
  local task_id="$1"
  local worker="$2"

  init_env
  
  # Get current task status
  local task_json=$(bd_cmd show "$task_id" --json 2>/dev/null || echo '{}')
  local status=$(echo "$task_json" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "")
  local assignee=$(echo "$task_json" | grep -oE '"assignee"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "")
  
  if [[ "$status" == "in_progress" ]]; then
    if [[ -n "$assignee" && "$assignee" != "$worker" ]]; then
      log_error "Task $task_id is already in_progress, assigned to: $assignee"
      return 1
    fi
  elif [[ "$status" == "closed" ]]; then
    log_error "Task $task_id is already closed"
    return 1
  fi
  return 0
}

# Atomic claim using flock to prevent two agents claiming same task simultaneously
claim_task_atomic() {
  local task_id="$1"
  local worker="$2"

  init_env

  if ! verify_task_claimable "$task_id" "$worker"; then
    exit 1
  fi

  if ! bd_cmd update "$task_id" --status in_progress --assignee "$worker" --actor "$worker"; then
    log_error "Failed to claim task $task_id (bd update)."
    exit 1
  fi
  
  log_info "Task $task_id claimed for $worker"
}

perform_merge_sequence() {
  # Requires WORKTREE_PATH, MAIN_REPO, BRANCH, TASK_ID, WORKER in scope

  log_step "Acquired merge queue lock; syncing branch against main..."

  cd "$WORKTREE_PATH"

  log_step "Fetching latest main..."
  git fetch origin main

  log_step "Rebasing on origin/main..."
  if ! git rebase origin/main; then
    log_error "Rebase failed! Resolve conflicts, then:"
    echo "  1. cd $WORKTREE_PATH"
    echo "  2. Fix conflicts in the listed files"
    echo "  3. git add <fixed-files>"
    echo "  4. git rebase --continue"
    echo "  5. Re-run: ./scripts/task-worktree.sh finish $WORKER $TASK_ID"
    echo ""
    echo "Or abort and start over:"
    echo "  git rebase --abort"
    exit 1
  fi

  log_step "Pushing branch to remote..."
  git push -f origin "$BRANCH"

  cd "$MAIN_REPO"

  if [[ -n $(git status --porcelain) ]]; then
    log_error "Main repo has uncommitted changes. Please commit or stash them first."
    git status --short
    exit 1
  fi

  git checkout main
  git pull origin main

  MAX_RETRIES=5
  RETRY=0
  BASE_DELAY=1000  # 1 second base delay

  while [[ $RETRY -lt $MAX_RETRIES ]]; do
    log_step "Merging $BRANCH into main (attempt $((RETRY+1))/$MAX_RETRIES)..."
    
    if git merge "origin/$BRANCH" --no-ff -m "Merge $TASK_ID

Worked-by: $WORKER
Branch: $BRANCH"; then
      # Try to push
      if git push origin main; then
        log_info "✅ Successfully merged and pushed!"
        break
      else
        log_warn "Push failed, pulling and retrying..."
        git reset --hard HEAD~1  # Undo merge
        git pull --rebase origin main
        RETRY=$((RETRY+1))
        
        # Exponential backoff with jitter to prevent thundering herd
        # Delay = base * 2^retry + random jitter
        if [[ $RETRY -lt $MAX_RETRIES ]]; then
          DELAY=$(( BASE_DELAY * (2 ** RETRY) ))
          log_info "Waiting with backoff before retry (${DELAY}ms + jitter)..."
          sleep "$(echo "scale=3; $DELAY/1000" | bc)"
          add_jitter $DELAY  # Add random jitter up to delay amount
        fi
      fi
    else
      log_error "Merge failed! This shouldn't happen after rebase."
      git merge --abort || true
      exit 1
    fi
  done
  
  if [[ $RETRY -eq $MAX_RETRIES ]]; then
    log_error "Failed to push after $MAX_RETRIES attempts. Manual intervention needed."
    log_error "Your changes are still on branch $BRANCH"
    log_error "To retry manually:"
    log_error "  cd $MAIN_REPO && git checkout main && git pull"
    log_error "  git merge origin/$BRANCH --no-ff && git push origin main"
    exit 1
  fi
}

# Pre-merge conflict detection to fail fast before entering the merge queue
check_merge_conflicts() {
  local worktree="$1"
  local target_branch="${2:-main}"

  log_step "Checking for pre-merge conflicts against $target_branch..."

  local original_dir
  original_dir=$(pwd)
  cd "$worktree"

  git fetch origin "$target_branch" >/dev/null 2>&1

  # Dry-run merge to detect conflicts without committing
  if git merge --no-commit --no-ff "origin/$target_branch" >/dev/null 2>&1; then
    git merge --abort >/dev/null 2>&1 || true
    cd "$original_dir"
    return 0
  fi

  local conflicts
  conflicts=$(git diff --name-only --diff-filter=U)
  git merge --abort >/dev/null 2>&1 || true
  cd "$original_dir"

  log_error "Conflicts detected when merging $BRANCH into $target_branch. Resolve before finishing."
  if [[ -n "$conflicts" ]]; then
    echo "Files with conflicts:"
    echo "$conflicts" | sed 's/^/  - /'
  fi
  return 2
}

# Merge coordinator: serialize merges with fair locking and timeout
merge_with_queue() {
  local lockfile="${MERGE_LOCK:-${BEADS_DIR}/merge.lock}"
  local max_wait="${MERGE_QUEUE_TIMEOUT:-300}"
  local wait_step="${MERGE_QUEUE_INTERVAL:-5}"
  local waited=0

  while true; do
    # Try to acquire the merge lock with a short timeout to allow progress logging
    if LOCK_TIMEOUT="$wait_step" LOCK_QUIET=1 with_lock "$lockfile" perform_merge_sequence; then
      return 0
    fi

    local rc=$?
    if [[ $rc -ne 95 ]]; then
      # Non-lock failure (e.g., merge/rebase error) - propagate immediately
      return $rc
    fi

    waited=$(( waited + wait_step ))
    if (( waited >= max_wait )); then
      log_error "Error: Merge queue timeout after ${waited}s while waiting for lock $lockfile"
      log_error "Another agent may be stuck merging. Retry shortly or investigate the stuck process."
      return 1
    fi

    log_info "Waiting for merge slot... (${waited}s)"
    # Add small jitter to avoid thundering herd when multiple agents wake up together
    sleep $(( wait_step + RANDOM % wait_step ))
  done
}

# Verify we're in a worktree, not the main repo
verify_in_worktree() {
  local expected_task="$1"
  local current_dir=$(pwd)
  local main_repo=$(get_main_repo)
  
  # Check if we're in the main repo
  if [[ "$current_dir" == "$main_repo" ]]; then
    log_error "You are in the main repository, not a worktree!"
    log_error "Current dir: $current_dir"
    log_error "Main repo: $main_repo"
    log_error ""
    log_error "To work on a task, first run:"
    log_error "  ./scripts/task-worktree.sh start <worker> <task-id>"
    log_error "Then cd to the worktree directory."
    return 1
  fi
  
  # Check if directory path contains 'worktrees'
  if [[ ! "$current_dir" =~ worktrees ]]; then
    log_warn "Current directory doesn't appear to be a worktree: $current_dir"
  fi
  
  return 0
}

# Get the main repo root (where .git is)
get_main_repo() {
  local git_common_dir=$(git rev-parse --git-common-dir 2>/dev/null)
  if [[ "$git_common_dir" == ".git" ]]; then
    # We're in the main repo, return current working dir
    pwd
  elif [[ -n "$git_common_dir" ]]; then
    # We're in a worktree, strip /.git from path
    echo "$git_common_dir" | sed 's/\/.git$//'
  else
    pwd
  fi
}

# Get worktree directory path
get_worktree_path() {
  local worker="$1"
  local task_id="$2"
  local main_repo=$(get_main_repo)
  echo "${main_repo}/../worktrees/${worker}/${task_id}"
}

# Remove zero-length merge locks that can linger after failures
clean_stale_merge_locks() {
  local lock_dir="${BEADS_DIR}/locks"
  for name in merge.lock merge-queue.lock; do
    local file="${lock_dir}/${name}"
    if [[ -f "$file" && ! -s "$file" ]]; then
      rm -f "$file"
      log_info "Removed stale lock: $file"
    fi
  done
}

COMMAND="${1:-}"
WORKER="${2:-}"
TASK_ID="${3:-}"

case "$COMMAND" in
  start)
    if [[ -z "$WORKER" || -z "$TASK_ID" ]]; then
      echo "Usage: $0 start <worker-name> <task-id>"
      echo "Example: $0 start agent-1 beads-vscode-abc"
      exit 1
    fi

    BRANCH="${WORKER}/${TASK_ID}"
    MAIN_REPO=$(get_main_repo)
    WORKTREE_PATH=$(get_worktree_path "$WORKER" "$TASK_ID")
    
    init_env
    detect_lock_backend
    HEARTBEAT_FILE="${HEARTBEAT_DIR}/${WORKER}__${TASK_ID}.hb"
    HEARTBEAT_PID_FILE="${WORKTREE_PATH}/.heartbeat.pid"
    HEARTBEAT_STARTED=false
    CLAIM_LOCK_TIMEOUT="$CLAIM_LOCK_TIMEOUT_DEFAULT"

    CLAIM_LOCK="${LOCK_DIR}/claim-${TASK_ID}.lock"
    CLAIMED=false
    START_COMPLETE=false

    cleanup_on_exit() {
      if [[ "$CLAIMED" == true && "$START_COMPLETE" != true ]]; then
        log_warn "Setup failed; releasing claim for $TASK_ID"
        LOCK_TIMEOUT="$CLAIM_LOCK_TIMEOUT" with_lock "$CLAIM_LOCK" bd_cmd update "$TASK_ID" --status open --assignee "" --actor "$WORKER" >/dev/null 2>&1 || true
      fi

      if [[ "$HEARTBEAT_STARTED" == true && "$START_COMPLETE" != true ]]; then
        stop_heartbeat "$HEARTBEAT_FILE" "$HEARTBEAT_PID_FILE"
      fi
    }
    trap cleanup_on_exit EXIT
    
    log_info "Starting task $TASK_ID for worker $WORKER"
    log_info "Main repo: $MAIN_REPO"
    log_info "Worktree path: $WORKTREE_PATH"
    
    # Ensure we're in the main repo for setup
    cd "$MAIN_REPO"

    log_step "Sweeping stale tasks before claiming..."
    sweep_stale_heartbeats "$HEARTBEAT_STALE_DEFAULT"

    if [[ "$SKIP_INITIAL_CLAIM" == "1" ]]; then
      log_step "Skipping claim (already claimed)"
      CLAIMED=true
    else
      # Atomically claim the task under a per-task lock
      log_step "Atomically claiming task (lock: $CLAIM_LOCK)..."
      LOCK_TIMEOUT="$CLAIM_LOCK_TIMEOUT" with_lock "$CLAIM_LOCK" claim_task_atomic "$TASK_ID" "$WORKER"
      CLAIMED=true
    fi

    # Fetch latest from origin
    log_step "Fetching latest from origin..."
    git fetch origin main
    
    # Check if worktree already exists (could be from a crash)
    if [[ -d "$WORKTREE_PATH" ]]; then
      # Check if it's a valid git worktree
      if git worktree list | grep -q "$WORKTREE_PATH"; then
        log_warn "Worktree already exists at $WORKTREE_PATH"
        log_info "Resuming existing worktree..."
        cd "$WORKTREE_PATH"
      else
        # Orphaned directory - clean it up
        log_warn "Found orphaned worktree directory (possibly from crash)"
        log_step "Cleaning up orphaned directory..."
        rm -rf "$WORKTREE_PATH"
        git worktree prune
        # Continue to create fresh worktree below
      fi
    fi
    
    # Create worktree if it doesn't exist (or was just cleaned up)
    if [[ ! -d "$WORKTREE_PATH" ]]; then
      # Create directory for worktrees if needed
      mkdir -p "$(dirname "$WORKTREE_PATH")"
      
      # Check if branch already exists
      if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        log_warn "Branch $BRANCH already exists. Creating worktree from existing branch."
        git worktree add "$WORKTREE_PATH" "$BRANCH"
      else
        # Create new worktree with new branch based on origin/main
        log_step "Creating worktree with branch: $BRANCH"
        git worktree add -b "$BRANCH" "$WORKTREE_PATH" origin/main
      fi
      
      cd "$WORKTREE_PATH"
    fi
    
    # Confirm claim persisted and is assigned to this worker
    log_step "Validating claim ownership..."
    task_json=$(bd_cmd show "$TASK_ID" --json 2>/dev/null || echo '{}')
    task_status=$(echo "$task_json" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^\"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^\"]*\)".*/\1/' || echo "")
    task_assignee=$(echo "$task_json" | grep -oE '"assignee"[[:space:]]*:[[:space:]]*"[^\"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^\"]*\)".*/\1/' || echo "")
    if [[ "$task_status" != "in_progress" || "$task_assignee" != "$WORKER" ]]; then
      log_error "Task claim lost (status=$task_status, assignee=$task_assignee). Aborting."
      log_step "Cleaning up worktree..."
      cd "$MAIN_REPO"
      git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"
      git branch -D "$BRANCH" 2>/dev/null || true
      exit 1
    fi

    # Install dependencies in worktree with isolated npm cache to avoid conflicts
    if [[ -f "package.json" ]] && [[ ! -d "node_modules" ]]; then
      log_step "Installing dependencies (with isolated cache)..."
      # Use a worker-specific npm cache to avoid conflicts
      NPM_CACHE_DIR="${HOME}/.npm-cache-${WORKER}"
      mkdir -p "$NPM_CACHE_DIR"
      npm install --cache "$NPM_CACHE_DIR"
    fi

    log_step "Starting heartbeat for task monitoring..."
    start_heartbeat "$HEARTBEAT_FILE" "$HEARTBEAT_PID_FILE"
    HEARTBEAT_STARTED=true

    START_COMPLETE=true
    
    log_info "✅ Worktree ready for $TASK_ID"
    log_info "Working directory: $(pwd)"
    log_info "Branch: $(git branch --show-current)"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}IMPORTANT: cd to your worktree to work on this task:${NC}"
    echo ""
    echo "  cd $WORKTREE_PATH"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Next steps (from the worktree directory):"
    echo "  1. npx bd show $TASK_ID"
    echo "  2. Implement the task"
    echo "  3. npm run compile && npm run lint"
    echo "  4. git add -A && git commit -m '$TASK_ID: <title>'"
    echo "  5. ./scripts/task-worktree.sh finish $WORKER $TASK_ID"
    ;;

  finish)
    if [[ -z "$WORKER" || -z "$TASK_ID" ]]; then
      echo "Usage: $0 finish <worker-name> <task-id>"
      echo "Example: $0 finish agent-1 beads-vscode-abc"
      exit 1
    fi

    BRANCH="${WORKER}/${TASK_ID}"
    MAIN_REPO=$(get_main_repo)
    WORKTREE_PATH=$(get_worktree_path "$WORKER" "$TASK_ID")
    init_env
    detect_lock_backend
    MERGE_LOCK="${BEADS_DIR}/merge.lock"
    HEARTBEAT_FILE="${HEARTBEAT_DIR}/${WORKER}__${TASK_ID}.hb"
    HEARTBEAT_PID_FILE="${WORKTREE_PATH}/.heartbeat.pid"
    
    log_info "Finishing task $TASK_ID for worker $WORKER"

    # Clear any leftover zero-length merge locks to avoid false contention
    clean_stale_merge_locks
    
    # Check if worktree exists
    if [[ ! -d "$WORKTREE_PATH" ]]; then
      log_error "Worktree not found at $WORKTREE_PATH"
      log_error "Are you sure you started this task with 'start $WORKER $TASK_ID'?"
      exit 1
    fi
    
    # Work in the worktree
    cd "$WORKTREE_PATH"
    
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
      log_error "Worktree is on branch '$CURRENT_BRANCH', expected '$BRANCH'"
      exit 1
    fi
    
    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
      log_error "You have uncommitted changes in the worktree. Commit them first:"
      git status --short
      exit 1
    fi
    
    # Check that we have commits beyond main
    COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
    if [[ "$COMMITS_AHEAD" -eq 0 ]]; then
      log_error "No commits on this branch. Did you forget to commit?"
      exit 1
    fi
    log_info "Branch has $COMMITS_AHEAD commit(s) to merge"

    # Fast-fail if merge would conflict before entering the queue
    if ! check_merge_conflicts "$WORKTREE_PATH" "main"; then
      log_error "Resolve the conflicts (rebase onto origin/main) and rerun finish."
      exit 1
    fi

    # Serialize rebase + merge to avoid thundering herd
    log_step "Queueing for merge (lock: $MERGE_LOCK, timeout ${MERGE_QUEUE_TIMEOUT:-300}s)..."
    MERGE_QUEUE_TIMEOUT="${MERGE_QUEUE_TIMEOUT:-300}" merge_with_queue

    log_step "Stopping heartbeat monitor..."
    stop_heartbeat "$HEARTBEAT_FILE" "$HEARTBEAT_PID_FILE"

    # Close the task before removing the worktree (requires guard)
    log_step "Closing task..."
    bd_cmd close "$TASK_ID" --reason "Implemented and merged" --actor "$WORKER" 2>/dev/null || true

    # Clean up worktree and branch
    log_step "Cleaning up worktree and branch..."
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"
    git branch -D "$BRANCH" 2>/dev/null || true
    git push origin --delete "$BRANCH" 2>/dev/null || true
    
    # Remove empty worker directory if no other worktrees
    WORKER_DIR="$(dirname "$WORKTREE_PATH")"
    if [[ -d "$WORKER_DIR" ]] && [[ -z "$(ls -A "$WORKER_DIR" 2>/dev/null)" ]]; then
      rmdir "$WORKER_DIR" 2>/dev/null || true
    fi
    
    log_info "✅ Task $TASK_ID complete!"
    log_info "Worktree and branch cleaned up."
    echo ""
    echo "You are now in: $(pwd)"
    echo "Next: ./scripts/task-worktree.sh start $WORKER <next-task-id>"
    ;;

  status)
    MAIN_REPO=$(get_main_repo)
    init_env
    detect_lock_backend
    cd "$MAIN_REPO"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Git Worktrees:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    git worktree list
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Current directory: $(pwd)"
    echo "Current branch: $(git branch --show-current)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_step "Checking for stale heartbeats (>${HEARTBEAT_STALE_DEFAULT}s)..."
    sweep_stale_heartbeats "$HEARTBEAT_STALE_DEFAULT"
    echo ""
    echo "In-progress tasks:"
    bd_cmd list --status in_progress 2>/dev/null || echo "(none)"
    ;;

  list)
    MAIN_REPO=$(get_main_repo)
    cd "$MAIN_REPO"
    git worktree list
    ;;

  audit)
    MAIN_REPO=$(get_main_repo)
    init_env
    cd "$MAIN_REPO"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Worktree Guard Audit"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Collect worktrees
    mapfile -t wt_lines < <(git worktree list --porcelain)
    declare -A wt_by_task
    declare -A wt_path_by_task
    for ((i=0; i<${#wt_lines[@]}; i++)); do
      line=${wt_lines[$i]}
      if [[ "$line" == "worktree "* ]]; then
        wt_path=${line#worktree }
        # Task inferred from folder name if pattern matches
        if [[ "$wt_path" =~ worktrees/([^/]+)/([^/]+)$ ]]; then
          worker="${BASH_REMATCH[1]}"; task_id="${BASH_REMATCH[2]}"
          wt_by_task[$task_id]="${wt_by_task[$task_id]} ${worker}"
          wt_path_by_task[$task_id]="$wt_path"
        fi
      fi
    done

    # In-progress tasks from bd
    inprog_json=$(bd_cmd list --status in_progress --json 2>/dev/null || echo '[]')
    mapfile -t inprog_ids < <(echo "$inprog_json" | jq -r '.[].id // empty')

    # Heartbeats
    shopt -s nullglob
    hb_files=(${HEARTBEAT_DIR}/*.hb)
    shopt -u nullglob
    declare -A hb_by_task
    for hb in "${hb_files[@]}"; do
      base=$(basename "$hb" .hb)
      worker="${base%%__*}"; task_id="${base#*__}"
      hb_by_task[$task_id]="${hb_by_task[$task_id]} ${worker}"
    done

    issues=0

    echo "- Checking duplicate worktrees per task..."
    for task in "${!wt_by_task[@]}"; do
      # count workers
      read -r -a workers <<<"${wt_by_task[$task]}"
      if (( ${#workers[@]} > 1 )); then
        issues=$((issues+1))
        log_error "Task $task has multiple worktrees (workers:${wt_by_task[$task]})"
      fi
    done

    echo "- Checking in-progress tasks without worktrees..."
    for task in "${inprog_ids[@]}"; do
      if [[ -z "${wt_path_by_task[$task]}" ]]; then
        issues=$((issues+1))
        log_error "Task $task is in_progress but no worktree found"
      fi
    done

    echo "- Checking worktrees whose tasks are not in_progress..."
    for task in "${!wt_path_by_task[@]}"; do
      found=false
      for ip in "${inprog_ids[@]}"; do
        [[ "$task" == "$ip" ]] && found=true && break
      done
      if [[ "$found" == false ]]; then
        issues=$((issues+1))
        log_warn "Worktree for $task exists but task is not in_progress"
      fi
    done

    echo "- Checking heartbeats consistency..."
    for task in "${!hb_by_task[@]}"; do
      if [[ -z "${wt_path_by_task[$task]}" ]]; then
        issues=$((issues+1))
        log_warn "Heartbeat present for $task but no worktree directory"
      fi
    done
    for task in "${!wt_path_by_task[@]}"; do
      if [[ -z "${hb_by_task[$task]}" ]]; then
        issues=$((issues+1))
        log_warn "Worktree for $task missing heartbeat file"
      fi
    done

    if (( issues == 0 )); then
      log_info "✅ Guard audit passed (no issues found)"
    else
      log_error "Guard audit found $issues issue(s)."
      echo "Remediation:"
      echo "  - Remove orphaned worktrees: git worktree remove <path> --force"
      echo "  - Clear stale heartbeats: rm .beads/heartbeats/<worker>__<task>.hb"
      echo "  - Update task status: npx bd update <task> --status open"
    fi
    ;;

  verify)
    # Verify the agent is in a worktree, not the main repo
    # Usage: verify [task-id] - optionally verify you're in the CORRECT worktree
    EXPECTED_TASK="$WORKER"  # $2 is task-id for verify command
    
    MAIN_REPO=$(get_main_repo)
    CURRENT_DIR=$(pwd)
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Worktree Verification"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Current directory: $CURRENT_DIR"
    echo "Main repo:         $MAIN_REPO"
    echo "Current branch:    $CURRENT_BRANCH"
    if [[ -n "$EXPECTED_TASK" ]]; then
      echo "Expected task:     $EXPECTED_TASK"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check if in main repo
    if [[ "$CURRENT_DIR" == "$MAIN_REPO" ]]; then
      log_error "❌ You are in the MAIN REPOSITORY"
      log_error ""
      log_error "Do NOT make changes here! Changes will conflict with other agents."
      log_error ""
      log_error "To work on a task:"
      log_error "  1. ./scripts/task-worktree.sh start <your-name> <task-id>"
      log_error "  2. cd to the worktree directory shown"
      log_error "  3. Make your changes there"
      exit 1
    fi
    
    # Check if directory looks like a worktree
    if [[ "$CURRENT_DIR" =~ worktrees/([^/]+)/([^/]+) ]]; then
      WORKER="${BASH_REMATCH[1]}"
      TASK="${BASH_REMATCH[2]}"
      log_info "✅ You are in a worktree"
      log_info "   Worker: $WORKER"
      log_info "   Task:   $TASK"
      
      # Verify branch matches expected pattern
      EXPECTED_BRANCH="${WORKER}/${TASK}"
      if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
        log_warn "Branch mismatch: expected '$EXPECTED_BRANCH', got '$CURRENT_BRANCH'"
      fi
      
      # If a specific task was requested, verify we're in that worktree
      if [[ -n "$EXPECTED_TASK" && "$TASK" != "$EXPECTED_TASK" ]]; then
        log_error "❌ WRONG WORKTREE!"
        log_error ""
        log_error "You're in worktree for:  $TASK"
        log_error "But you should be in:    $EXPECTED_TASK"
        log_error ""
        log_error "To switch to the correct worktree:"
        log_error "  cd $(get_worktree_path "$WORKER" "$EXPECTED_TASK")"
        log_error ""
        log_error "Or if you haven't started that task yet:"
        log_error "  ./scripts/task-worktree.sh start $WORKER $EXPECTED_TASK"
        exit 1
      fi
    else
      log_warn "⚠️  Directory doesn't match expected worktree pattern"
      log_warn "   Expected: .../worktrees/<worker>/<task-id>"
      log_warn ""
      log_warn "   You may be in a worktree with a different structure."
      log_warn "   Proceed with caution."
    fi
    
    echo ""
    echo "You can safely make changes in this directory."
    ;;

  cleanup)
    if [[ -z "$WORKER" ]]; then
      echo "Usage: $0 cleanup <worker-name>"
      exit 1
    fi
    
    MAIN_REPO=$(get_main_repo)
    init_env
    WORKTREES_BASE="${MAIN_REPO}/../worktrees/${WORKER}"
    
    cd "$MAIN_REPO"
    
    log_warn "This will remove all worktrees and branches for worker '$WORKER'"
    echo ""
    echo "Worktrees to remove:"
    if [[ -d "$WORKTREES_BASE" ]]; then
      ls -la "$WORKTREES_BASE" 2>/dev/null || echo "(none found)"
    else
      echo "(none found)"
    fi
    echo ""
    echo "Branches to delete (local):"
    git branch | grep "  $WORKER/" || echo "(none found)"
    echo ""
    echo "Branches to delete (remote):"
    git branch -r | grep "origin/$WORKER/" || echo "(none found)"
    echo ""
    
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      # Remove worktrees
      if [[ -d "$WORKTREES_BASE" ]]; then
        for wt in "$WORKTREES_BASE"/*; do
          if [[ -d "$wt" ]]; then
            log_info "Removing worktree: $wt"
            git worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
          fi
        done
        rmdir "$WORKTREES_BASE" 2>/dev/null || true
      fi
      
      # Delete local branches
      git branch | grep "  $WORKER/" | xargs -r git branch -D 2>/dev/null || true
      
      # Delete remote branches
      git branch -r | grep "origin/$WORKER/" | sed 's/origin\///' | xargs -I {} git push origin --delete {} 2>/dev/null || true
      
      if [[ -d "$HEARTBEAT_DIR" ]]; then
        rm -f "$HEARTBEAT_DIR"/${WORKER}__*.hb 2>/dev/null || true
      fi
      
      # Prune worktree list
      git worktree prune
      
      log_info "✅ Cleanup complete for worker $WORKER"
    else
      log_info "Cancelled"
    fi
    ;;

  claim-next)
    if [[ -z "$WORKER" ]]; then
      echo "Usage: $0 claim-next <worker-name>"
      exit 1
    fi
    cmd_claim_next "$WORKER"
    ;;

  *)
    echo "task-worktree.sh - Multi-agent task workflow using git worktrees"
    echo ""
    echo "Git worktrees give each agent their own isolated working directory,"
    echo "preventing file conflicts when multiple agents work simultaneously."
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start <worker> <task-id>   Create worktree and start working on task"
    echo "  finish <worker> <task-id>  Merge worktree back to main and clean up"
    echo "  verify [task-id]           Check you're in a worktree (optionally, the right one)"
    echo "  status                     Show all worktrees and current state"
    echo "  list                       List all active worktrees"
    echo "  cleanup <worker>           Remove all worktrees/branches for a worker"
    echo ""
    echo "Safety Features:"
    echo "  • Atomic task claiming - prevents two agents grabbing same task"
    echo "  • Double-check claim after worktree setup"
    echo "  • Exponential backoff with jitter on merge retries"
    echo "  • Merge queue lock serializes rebases/pushes to main"
    echo "  • SQLite WAL + busy timeout on shared beads DB"
    echo "  • Heartbeats with stale-task recovery sweep"
    echo "  • Isolated npm cache per worker"
    echo "  • Orphaned worktree detection and cleanup"
    echo ""
    echo "Examples:"
    echo "  $0 start agent-1 beads-vscode-abc"
    echo "  $0 verify                            # Check you're in a worktree"
    echo "  $0 verify beads-vscode-abc           # Check you're in the RIGHT worktree"
    echo "  $0 finish agent-1 beads-vscode-abc"
    echo "  $0 status"
    echo "  $0 cleanup agent-1"
    echo ""
    echo "Worktree locations:"
    echo "  Main repo:  /path/to/repo"
    echo "  Worktrees:  /path/to/worktrees/<worker>/<task-id>"
    echo "  npm cache:  ~/.npm-cache-<worker>"
    ;;
esac
