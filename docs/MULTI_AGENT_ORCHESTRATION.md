# Multi-Agent Orchestration Hardening

This repo uses the `scripts/task-worktree.sh` helper to let multiple agents work in parallel. The script now adds stronger coordination primitives to prevent race conditions, thundering herd merges, and orphaned tasks.

## Safety Features

- **Atomic task claiming (flock):** `start` wraps `bd update --status in_progress` in a per-task lock at `.beads/locks/claim-<task>.lock`. The verify + claim happens under the lock before any git worktree is created, eliminating the window where two agents can grab the same task.
- **Merge queue (flock):** `finish` acquires `.beads/locks/merge-queue.lock` before rebasing, pushing the feature branch, and merging to `main`. Only one merge pipeline runs at a time, preventing thundering herd pushes.
- **Heartbeat + crash recovery:** `start` spawns a lightweight background touch loop that writes `.beads/heartbeats/<worker>__<task>.hb` every 30s. `status` (and `start`) sweep for heartbeats older than 5 minutes and automatically reopen the task while clearing the stale heartbeat, enabling recovery from crashed agents.
- **SQLite contention relief:** `init_env` enforces `PRAGMA journal_mode=WAL` and `busy_timeout=5000` on `.beads/beads.db` (when `sqlite3` is available) to improve concurrent bd access.
- **Daemon-safe bd wrapper:** All bd invocations flow through `bd_cmd`, which pins `BEADS_DIR` to the main repo `.beads` directory and sets `BEADS_NO_DAEMON=1` to avoid stale daemon reads from worktrees.

## Key Paths

- Locks: `.beads/locks/claim-<task>.lock`, `.beads/locks/merge-queue.lock`
- Heartbeats: `.beads/heartbeats/<worker>__<task>.hb`
- Heartbeat PID (per worktree): `<worktree>/.heartbeat.pid`

## Operational Flow

1. **start**
   - Sweep stale heartbeats (>5m) and reopen those tasks.
   - Atomically claim the new task under a per-task lock.
   - Create/restore the worktree, validate ownership, install deps.
   - Launch heartbeat background process.

2. **finish**
   - Validate clean worktree and commits ahead of `main`.
   - Enter merge queue lock; rebase on latest `origin/main`, push feature branch, merge to `main` with backoff on push failures.
   - Stop heartbeat, clean worktree/branch, close task.

3. **status**
   - Shows worktrees and also sweeps for stale heartbeats (>5m) before listing in-progress tasks, automatically freeing abandoned work.

## Tuning

Environment variables:

- `HEARTBEAT_INTERVAL` (or `HEARTBEAT_INTERVAL_SECONDS`) – seconds between heartbeat touches (default 30)
- `HEARTBEAT_STALE_SECONDS` – stale threshold used by the sweeper (default 300)
- `LOCK_TIMEOUT` (or `LOCK_TIMEOUT_SECONDS`) – seconds to wait when acquiring locks (default 10; `start` uses 5s, `finish` uses 300s for merge queue)

These can be set per invocation, e.g. `HEARTBEAT_INTERVAL=10 ./scripts/task-worktree.sh start Cherry beady-123`.

## Notes

- Heartbeat sweeps run from both `start` and `status`, so orphaned tasks are reclaimed even if no one runs `status` manually.
- Lock and heartbeat files live in the shared `.beads` directory, so multiple worktrees on the same machine coordinate correctly.
- If `/usr/bin/flock` is unavailable, the script automatically falls back to a python `fcntl`-based lock helper (still using the same lock files).
