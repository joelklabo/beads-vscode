# Locking Spike (beady-0kv)

**Setup**
- Machine: macOS (bash 3.x), 5 concurrent agents
- Workload: each agent performs 200 `INSERT` writes into a temp copy of `.beads/beads.db`
- Modes tested via `scripts/test-locking.sh`:
  - `baseline` (default SQLite journal)
  - `wal` (PRAGMA journal_mode=WAL, busy_timeout=5s)
  - `flock` (external lock around each write; uses `flock` if present, mkdir fallback otherwise)

**Results (5×200 writes)**

| Mode     | Rows written | Duration (ms) | Errors |
|----------|--------------|---------------|--------|
| baseline | 424          | 1327          | yes (database is locked) |
| wal      | 625          | 1354          | yes (database is locked) |
| flock    | 1625         | 12483         | no |

Per-agent distribution showed that, without an external lock, one agent dominated writes while others failed due to `database is locked` errors. WAL reduced contention slightly but did not eliminate write failures. With flock serialization every agent completed, at the cost of higher total wall time (expected because writes were serialized).

**Findings**
- SQLite WAL alone is insufficient for concurrent writers in this workload; write failures still occur under 5 parallel agents.
- Serializing critical bd operations with a file lock (flock or mkdir fallback) eliminates write errors and keeps per-agent counts balanced.
- Using a fallback lock is required on macOS where the `flock` binary may be absent; mkdir-based locking worked for this spike.

**Recommendations**
- Keep WAL enabled on `.beads/beads.db` to improve read concurrency, but protect write paths (claim/merge, status updates) with a lock.
- Ship `scripts/test-locking.sh` for quick regression checks and tuning (`ITERATIONS`, `AGENTS`, `LOCK_TIMEOUT`).
- Prefer `flock` when available; otherwise fall back to mkdir locking to avoid hard failures on macOS default shells.
