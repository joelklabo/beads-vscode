#!/bin/bash
# Concurrent locking experiment for Beads
#
# Runs a simple SQLite write workload with 5 simulated agents across three modes:
#   1) baseline  - default SQLite journal (DELETE)
#   2) wal       - Write-Ahead Logging enabled
#   3) flock     - external flock (or mkdir fallback) serializing writers
#
# Results help compare reliability and latency for the Beads database under load.

set -euo pipefail

MODES=(baseline wal flock)
ITERATIONS=${ITERATIONS:-200}
LOCK_TIMEOUT=${LOCK_TIMEOUT:-5}
AGENTS=5

main_repo="$(git rev-parse --show-toplevel)"
beads_src="$main_repo/.beads"

if [[ ! -d "$beads_src" ]]; then
  echo "❌ No .beads directory found at $beads_src"
  exit 1
fi

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1"; exit 1; }
}

require sqlite3

lock_with_flock() {
  local lock_file="$1"; shift
  if command -v flock >/dev/null 2>&1; then
    flock -w "$LOCK_TIMEOUT" "$lock_file" "$@"
    return $?
  fi
  # Fallback: mkdir-based lock
  local start=$SECONDS
  local fallback="${lock_file}.dlock"
  while ! mkdir "$fallback" 2>/dev/null; do
    if (( SECONDS - start >= LOCK_TIMEOUT )); then
      echo "timeout acquiring fallback lock $fallback" >&2
      return 1
    fi
    sleep 0.1
  done
  "$@"
  local rc=$?
  rmdir "$fallback" 2>/dev/null || true
  return $rc
}

setup_db() {
  local dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$beads_src" "$dest/.beads"
  sqlite3 "$dest/.beads/beads.db" "CREATE TABLE IF NOT EXISTS locks_test (id INTEGER PRIMARY KEY, agent TEXT, ts INTEGER, note TEXT);"
}

enable_wal() {
  local db="$1"
  sqlite3 "$db" "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;" >/dev/null
}

agent() {
  local agent_id="$1" mode="$2" db="$3" lock_file="$4"
  for i in $(seq 1 "$ITERATIONS"); do
    case "$mode" in
      flock)
        lock_with_flock "$lock_file" sqlite3 "$db" "INSERT INTO locks_test(agent, ts, note) VALUES('$agent_id', strftime('%s','now'), '$mode');" || return 1
        ;;
      *)
        sqlite3 "$db" "INSERT INTO locks_test(agent, ts, note) VALUES('$agent_id', strftime('%s','now'), '$mode');" || return 1
        ;;
    esac
  done
}

run_mode() {
  local mode="$1" workdir
  workdir=$(mktemp -d /tmp/beads-locktest-XXXX)
  setup_db "$workdir"
  local db="$workdir/.beads/beads.db"
  local lock_file="$workdir/claim.lock"

  [[ "$mode" == "wal" ]] && enable_wal "$db"

  echo "--- Mode: $mode ---"
  start_ms=$(python3 - <<'PY'
import time; print(int(time.time()*1000))
PY
)

  pids=()
  for n in $(seq 1 "$AGENTS"); do
    agent "$n" "$mode" "$db" "$lock_file" &
    pids+=($!)
  done

  rc=0
  for pid in "${pids[@]}"; do
    wait "$pid" || rc=1
  done

  end_ms=$(python3 - <<'PY'
import time; print(int(time.time()*1000))
PY
)

  total=$((end_ms - start_ms))
  rows=$(sqlite3 "$db" "SELECT COUNT(*) FROM locks_test;")
  echo "rows_written=$rows duration_ms=$total status=$([[ $rc -eq 0 ]] && echo ok || echo error)"
  echo "per_agent_counts:"; sqlite3 "$db" "SELECT agent, COUNT(*) FROM locks_test GROUP BY agent ORDER BY agent;"
  rm -rf "$workdir"
  return $rc
}

echo "Running $AGENTS agents x $ITERATIONS iterations"
for m in "${MODES[@]}"; do
  if ! run_mode "$m"; then
    echo "mode $m: errors observed" >&2
  fi
done
