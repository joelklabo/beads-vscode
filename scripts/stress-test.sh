#!/usr/bin/env bash
# Multi-agent stress harness for Beads worktree workflow
# Safe to run locally; it clones the repo into a temporary sandbox and never
# touches your main checkout or remote.

set -euo pipefail

AGENTS=${AGENTS:-5}
ITERATIONS=${ITERATIONS:-50}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
BD_BIN="$REPO_ROOT/node_modules/.bin/bd"

TMP_ROOT=""
SANDBOX_REPO=""
SANDBOX_ORIGIN=""

log() { echo "[stress] $*"; }
fail() { echo "[stress][FAIL] $*" >&2; exit 1; }

cleanup() {
  if [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    rm -rf "$TMP_ROOT"
  fi
}
trap cleanup EXIT

require_tools() {
  command -v git >/dev/null || fail "git is required"
  [[ -x "$BD_BIN" ]] || fail "bd CLI not found at $BD_BIN (run npm install)"
}

setup_sandbox() {
  TMP_ROOT=$(mktemp -d -t beads-stress-XXXX)
  SANDBOX_ORIGIN="$TMP_ROOT/origin.git"
  SANDBOX_REPO="$TMP_ROOT/repo"

  log "Creating sandbox repo under $TMP_ROOT"
  git clone --mirror "$REPO_ROOT" "$SANDBOX_ORIGIN" >/dev/null 2>&1
  git clone "$SANDBOX_ORIGIN" "$SANDBOX_REPO" >/dev/null 2>&1

  # Initialize a fresh beads database in the sandbox
  (cd "$SANDBOX_REPO" && BEADS_NO_DAEMON=1 "$BD_BIN" init --no-daemon >/dev/null)
}

create_task() {
  local title="$1"
  local json
  json=$(cd "$SANDBOX_REPO" && BEADS_NO_DAEMON=1 "$BD_BIN" create "$title" --issue-type task --json)
  echo "$json" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed 's/.*:"\([^"]*\)"/\1/'
}

count_worktrees_for() {
  local task_id="$1"
  find "$TMP_ROOT/worktrees" -maxdepth 2 -type d -name "$task_id" 2>/dev/null | wc -l | tr -d ' '
}

scenario_race_condition() {
  log "Scenario: race_condition (agents=$AGENTS)"
  local task_id
  task_id=$(create_task "Stress: race condition")

  pushd "$SANDBOX_REPO" >/dev/null
  for i in $(seq 1 "$AGENTS"); do
    ( ./scripts/task-worktree.sh start agent-$i "$task_id" >/dev/null 2>&1 || true ) &
  done
  wait

  local wt_count
  wt_count=$(count_worktrees_for "$task_id")
  [[ "$wt_count" -eq 1 ]] || fail "Expected exactly 1 worktree, saw $wt_count"

  local assignee
  assignee=$(BEADS_NO_DAEMON=1 "$BD_BIN" show "$task_id" --json | grep -oE '"assignee"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:"\([^"]*\)"/\1/')
  [[ -n "$assignee" ]] || fail "Task not claimed"

  # Cleanup
  for i in $(seq 1 "$AGENTS"); do
    ./scripts/task-worktree.sh cleanup agent-$i >/dev/null 2>&1 || true
  done
  popd >/dev/null
  log "race_condition ✅"
}

scenario_thundering_herd() {
  log "Scenario: thundering_herd (agents=$AGENTS)"
  pushd "$SANDBOX_REPO" >/dev/null

  local tasks=()
  for i in $(seq 1 "$AGENTS"); do
    tasks+=( $(create_task "Stress: herd $i") )
  done

  # Start all tasks
  for i in $(seq 1 "$AGENTS"); do
    local t=${tasks[$((i-1))]}
    ./scripts/task-worktree.sh start agent-$i "$t" >/dev/null 2>&1
    local wt="$SANDBOX_REPO/../worktrees/agent-$i/$t"
    mkdir -p "$wt/tmp"
    echo "agent-$i" > "$wt/tmp/herd-$i.txt"
    (cd "$wt" && git add tmp/herd-$i.txt && git commit -m "herd $i" >/dev/null 2>&1)
  done

  # Finish concurrently to hit merge queue
  for i in $(seq 1 "$AGENTS"); do
    local t=${tasks[$((i-1))]}
    ( ./scripts/task-worktree.sh finish agent-$i "$t" >/dev/null 2>&1 ) &
  done
  wait

  # Verify all files landed on main
  git checkout main >/dev/null 2>&1
  for i in $(seq 1 "$AGENTS"); do
    [[ -f "tmp/herd-$i.txt" ]] || fail "Missing herd artifact for agent-$i"
  done

  popd >/dev/null
  log "thundering_herd ✅"
}

scenario_crash_recovery() {
  log "Scenario: crash_recovery"
  pushd "$SANDBOX_REPO" >/dev/null

  local task_id
  task_id=$(create_task "Stress: crash recovery")

  ./scripts/task-worktree.sh start agent-crash "$task_id" >/dev/null 2>&1
  local hb_file="$SANDBOX_REPO/.beads/heartbeats/agent-crash__${task_id}.hb"
  local pid_file="$SANDBOX_REPO/../worktrees/agent-crash/$task_id/.heartbeat.pid"

  # Simulate crash by killing heartbeat and leaving files
  if [[ -f "$pid_file" ]]; then
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  fi

  # Age the heartbeat then sweep
  touch -mt 197001010000 "$hb_file"
  HEARTBEAT_STALE_SECONDS=1 ./scripts/task-worktree.sh status >/dev/null 2>&1

  local status
  status=$(BEADS_NO_DAEMON=1 "$BD_BIN" show "$task_id" --json | grep -oE '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:"\([^"]*\)"/\1/')
  [[ "$status" == "open" ]] || fail "Crash recovery did not reopen task"

  popd >/dev/null
  log "crash_recovery ✅"
}

scenario_db_contention() {
  log "Scenario: db_contention (parallel list)"
  pushd "$SANDBOX_REPO" >/dev/null
  pids=()
  for _ in $(seq 1 "$AGENTS"); do
    (BEADS_NO_DAEMON=1 "$BD_BIN" list --json >/dev/null) &
    pids+=($!)
  done
  for p in "${pids[@]}"; do
    wait "$p" || fail "bd list failed under contention"
  done
  popd >/dev/null
  log "db_contention ✅"
}

main() {
  require_tools
  setup_sandbox

  scenario_race_condition
  scenario_thundering_herd
  scenario_crash_recovery
  scenario_db_contention

  log "All stress scenarios completed"
}

main "$@"
