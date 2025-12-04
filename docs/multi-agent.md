# Multi-agent reliability improvements

This repository now ships several guardrails to keep 3+ agents from stepping on each other when using `./scripts/task-worktree.sh`.

## What changed

- **Atomic claiming (flock)** – task claims go through `.beads/locks/claim.lock` so only one worker can mark a task `in_progress` at a time.
- **Merge queue lock** – finishing a task acquires `.beads/locks/merge.lock` to serialize rebases/merges and avoid thundering herd pushes to `main`.
- **SQLite WAL mode** – the shared `.beads/beads.db` is automatically put in WAL with a 5s busy timeout to reduce db write contention.
- **Heartbeats** – `start` launches a background heartbeat that writes to `.beads/heartbeats/<worker>-<task>.hb`; `finish`/`cleanup` stop and remove it. `status` reports stale heartbeats (>300s by default).
- **Pre-merge conflict heads-up** – before merging, overlapping files between your branch and latest `main` are listed so you can resolve early.

## Tuning

- `LOCK_TIMEOUT_SECONDS` (default 15) – how long to wait for claim/merge locks.
- `HEARTBEAT_INTERVAL_SECONDS` (default 10) – heartbeat write interval.
- `HEARTBEAT_STALE_SECONDS` (default 300) – when `status` flags an agent as stale.
- `BEADS_DIR` – override the shared beads directory if you keep `.beads` elsewhere.

## Tips

- Always run `task-worktree.sh status` to see stale agents; clean lingering worktrees with `task-worktree.sh cleanup <worker>`.
- If a heartbeat looks stuck, run `finish` from that worktree or `cleanup` the worker to remove locks/heartbeats.
