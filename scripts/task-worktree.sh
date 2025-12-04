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

# Default timeouts (can be tuned via env)
LOCK_TIMEOUT_SECONDS="${LOCK_TIMEOUT_SECONDS:-15}"
HEARTBEAT_INTERVAL_SECONDS="${HEARTBEAT_INTERVAL_SECONDS:-10}"
HEARTBEAT_STALE_SECONDS="${HEARTBEAT_STALE_SECONDS:-300}"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Resolve the shared beads directory (defaults to main repo .beads)
get_beads_dir() {
  local main_repo=$(get_main_repo)
  echo "${BEADS_DIR:-${main_repo}/.beads}"
}

# Ensure BEADS_DIR and daemon settings are consistent across worktrees
export_beads_env() {
  local beads_dir="$1"
  export BEADS_DIR="$beads_dir"
  export BEADS_NO_DAEMON=1
}

# Enable WAL mode on the shared beads SQLite DB to reduce lock contention
enable_wal_mode() {
  local beads_dir="$1"
  local db_path="$beads_dir/beads.db"
  if [[ ! -f "$db_path" ]]; then
    return 0
  fi
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db_path" "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;" >/dev/null 2>&1 || \
      log_warn "Could not enable WAL on $db_path"
  else
    log_warn "sqlite3 not found; skipping WAL enablement"
  fi
}

# Execute a command while holding an exclusive flock lock
with_lock() {
  local lock_file="$1"; shift
  mkdir -p "$(dirname "$lock_file")"
  local lock_fd=200
  eval "exec ${lock_fd}>\"$lock_file\""
  if ! flock -w "$LOCK_TIMEOUT_SECONDS" "$lock_fd"; then
    log_error "Timeout acquiring lock: $lock_file"
    return 1
  fi
  set +e
  "$@"
  local rc=$?
  set -e
  flock -u "$lock_fd"
  eval "exec ${lock_fd}>&-"
  return $rc
}

# Heartbeat helpers to detect crashed agents
start_heartbeat() {
  local worker="$1"; local task_id="$2"; local hb_dir="$3"
  local hb_file="$hb_dir/${worker}-${task_id}.hb"
  local pid_file="$hb_dir/${worker}-${task_id}.pid"
  mkdir -p "$hb_dir"
  stop_heartbeat "$worker" "$task_id" "$hb_dir" true
  nohup bash -c "while true; do date +%s > '$hb_file'; sleep $HEARTBEAT_INTERVAL_SECONDS; done" >/dev/null 2>&1 &
  echo $! > "$pid_file"
}

stop_heartbeat() {
  local worker="$1"; local task_id="$2"; local hb_dir="$3"; local quiet="$4"
  local pid_file="$hb_dir/${worker}-${task_id}.pid"
  local hb_file="$hb_dir/${worker}-${task_id}.hb"
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      [[ "$quiet" == "true" ]] || log_info "Stopped heartbeat for $task_id"
    fi
    rm -f "$pid_file"
  fi
  rm -f "$hb_file"
}

# Add random jitter to prevent thundering herd
add_jitter() {
  local max_ms="${1:-2000}"  # Default 0-2 seconds
  local jitter=$((RANDOM % max_ms))
  sleep "$(echo "scale=3; $jitter/1000" | bc)"
}

# Verify task is claimable (not already in_progress by another agent)
verify_task_claimable() {
  local task_id="$1"
  local worker="$2"
  
  # Get current task status
  local task_json=$(npx bd show "$task_id" --json 2>/dev/null || echo '{}')
  local status=$(echo "$task_json" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "")
  local assignee=$(echo "$task_json" | grep -o '"assignee":"[^"]*"' | cut -d'"' -f4 || echo "")
  
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
    BEADS_DIR_PATH=$(get_beads_dir)
    LOCK_DIR="${BEADS_DIR_PATH}/locks"
    HEARTBEAT_DIR="${BEADS_DIR_PATH}/heartbeats"
    export_beads_env "$BEADS_DIR_PATH"
    enable_wal_mode "$BEADS_DIR_PATH"
    WORKTREE_PATH=$(get_worktree_path "$WORKER" "$TASK_ID")
    
    log_info "Starting task $TASK_ID for worker $WORKER"
    log_info "Main repo: $MAIN_REPO"
    log_info "Worktree path: $WORKTREE_PATH"
    
    # Ensure we're in the main repo for setup
    cd "$MAIN_REPO"
    
    # ATOMIC CLAIM: Verify task is available before proceeding
    log_step "Verifying task is claimable..."
    if ! verify_task_claimable "$TASK_ID" "$WORKER"; then
      log_error "Cannot claim task. Pick a different task with: npx bd ready"
      exit 1
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

    # Link the shared beads database into the worktree for local bd commands
    if [[ ! -e .beads ]]; then
      ln -s "$BEADS_DIR_PATH" .beads
    fi
    
    # Helper used inside locks for claim validation/update
    claim_task() {
      local task_id="$1"; local worker="$2"
      if ! verify_task_claimable "$task_id" "$worker"; then
        return 99
      fi
      npx bd update "$task_id" --status in_progress --assignee "$worker" --actor "$worker"
    }

    # Re-verify task is still claimable (double-check after worktree setup)
    log_step "Re-verifying task claim (double-check)..."
    if ! with_lock "${LOCK_DIR}/claim.lock" verify_task_claimable "$TASK_ID" "$WORKER"; then
      log_error "Task was claimed by another agent while setting up worktree!"
      log_step "Cleaning up worktree..."
      cd "$MAIN_REPO"
      git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"
      git branch -D "$BRANCH" 2>/dev/null || true
      log_error "Pick a different task with: npx bd ready"
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
    
    # Update task status in bd - this is the official claim (atomic with lock)
    log_step "Claiming task (marking as in_progress)..."
    if ! with_lock "${LOCK_DIR}/claim.lock" claim_task "$TASK_ID" "$WORKER"; then
      rc=$?
      if [[ $rc -eq 99 ]]; then
        log_warn "Claim rejected: task already in progress elsewhere"
      else
        log_warn "Could not update task status in bd (lock busy or bd error)"
      fi
      exit 1
    fi

    # Start a lightweight heartbeat so stale agents can be detected
    start_heartbeat "$WORKER" "$TASK_ID" "$HEARTBEAT_DIR"
    
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
    BEADS_DIR_PATH=$(get_beads_dir)
    LOCK_DIR="${BEADS_DIR_PATH}/locks"
    HEARTBEAT_DIR="${BEADS_DIR_PATH}/heartbeats"
    export_beads_env "$BEADS_DIR_PATH"
    enable_wal_mode "$BEADS_DIR_PATH"
    WORKTREE_PATH=$(get_worktree_path "$WORKER" "$TASK_ID")
    
    log_info "Finishing task $TASK_ID for worker $WORKER"
    
    # Check if worktree exists
    if [[ ! -d "$WORKTREE_PATH" ]]; then
      log_error "Worktree not found at $WORKTREE_PATH"
      log_error "Are you sure you started this task with 'start $WORKER $TASK_ID'?"
      exit 1
    fi
    
    # Work in the worktree
    cd "$WORKTREE_PATH"

    # Stop heartbeat for this task if running
    stop_heartbeat "$WORKER" "$TASK_ID" "$HEARTBEAT_DIR" true
    
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
    
    # Fetch latest main
    log_step "Fetching latest main..."
    git fetch origin main
    
    # Rebase on main
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
    
    # Push the branch to remote
    log_step "Pushing branch to remote..."
    git push -f origin "$BRANCH"

    # Serialize merge to main with a merge queue lock to avoid thundering herd
    cd "$MAIN_REPO"

    merge_into_main() {
      # Make sure main worktree is clean
      if [[ -n $(git status --porcelain) ]]; then
        log_error "Main repo has uncommitted changes. Please commit or stash them first."
        git status --short
        return 1
      fi

      git checkout main
      git pull origin main

      # Pre-merge conflict detection: warn if both branches touch same files
      local ours_files=$(git diff --name-only origin/main.."$BRANCH" || true)
      local main_files=$(git diff --name-only HEAD..origin/main || true)
      local overlap=$(comm -12 <(echo "$ours_files" | sort -u) <(echo "$main_files" | sort -u))
      if [[ -n "$overlap" ]]; then
        log_warn "Potential conflicts with main in files:\n$overlap"
      fi

      MAX_RETRIES=5
      RETRY=0
      BASE_DELAY=1000  # 1 second base delay
      
      while [[ $RETRY -lt $MAX_RETRIES ]]; do
        log_step "Merging $BRANCH into main (attempt $((RETRY+1))/$MAX_RETRIES)..."
        
        if git merge "origin/$BRANCH" --no-ff -m "Merge $TASK_ID

Worked-by: $WORKER
Branch: $BRANCH"; then
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
          return 1
        fi
      done

      if [[ $RETRY -eq $MAX_RETRIES ]]; then
        log_error "Failed to push after $MAX_RETRIES attempts. Manual intervention needed."
        log_error "Your changes are still on branch $BRANCH"
        log_error "To retry manually:"
        log_error "  cd $MAIN_REPO && git checkout main && git pull"
        log_error "  git merge origin/$BRANCH --no-ff && git push origin main"
        return 1
      fi

      return 0
    }

    if ! with_lock "${LOCK_DIR}/merge.lock" merge_into_main; then
      exit 1
    fi
    
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
    
    # Close the task
    log_step "Closing task..."
    npx bd close "$TASK_ID" --reason "Implemented and merged" --actor "$WORKER" 2>/dev/null || true
    
    log_info "✅ Task $TASK_ID complete!"
    log_info "Worktree and branch cleaned up."
    echo ""
    echo "You are now in: $(pwd)"
    echo "Next: ./scripts/task-worktree.sh start $WORKER <next-task-id>"
    ;;

  status)
    MAIN_REPO=$(get_main_repo)
    BEADS_DIR_PATH=$(get_beads_dir)
    HEARTBEAT_DIR="${BEADS_DIR_PATH}/heartbeats"
    export_beads_env "$BEADS_DIR_PATH"
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
    echo "In-progress tasks:"
    npx bd list --status in_progress 2>/dev/null || echo "(none)"

    if [[ -d "$HEARTBEAT_DIR" ]]; then
      echo ""
      echo "Heartbeat status (age in seconds):"
      now_ts=$(date +%s)
      found=false
      for hb in "$HEARTBEAT_DIR"/*.hb; do
        [[ -e "$hb" ]] || continue
        found=true
        ts=$(cat "$hb" 2>/dev/null || echo 0)
        age=$((now_ts - ts))
        label=$(basename "$hb" .hb)
        if [[ $age -gt $HEARTBEAT_STALE_SECONDS ]]; then
          echo "  $label: ${age}s (STALE)"
        else
          echo "  $label: ${age}s"
        fi
      done
      [[ "$found" == false ]] && echo "  (no heartbeats)"
    fi
    ;;

  list)
    MAIN_REPO=$(get_main_repo)
    cd "$MAIN_REPO"
    git worktree list
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
    BEADS_DIR_PATH=$(get_beads_dir)
    HEARTBEAT_DIR="${BEADS_DIR_PATH}/heartbeats"
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
      
      # Remove heartbeat artifacts for this worker
      if [[ -d "$HEARTBEAT_DIR" ]]; then
        rm -f "$HEARTBEAT_DIR"/${WORKER}-*.hb 2>/dev/null || true
        rm -f "$HEARTBEAT_DIR"/${WORKER}-*.pid 2>/dev/null || true
      fi

      # Prune worktree list
      git worktree prune
      
      log_info "✅ Cleanup complete for worker $WORKER"
    else
      log_info "Cancelled"
    fi
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
    echo "  • Merge queue lock to serialize pushes to main"
    echo "  • SQLite WAL + busy timeout on shared beads DB"
    echo "  • Heartbeats for crash/stall detection"
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
