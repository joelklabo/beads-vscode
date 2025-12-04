# Worktree Guard & Ordering Spec

Date: 2025-12-04
Owner: Cherry

## Goals
- Prevent conflicting worktree activity across agents (CLI, VS Code, future TUI).
- Enforce a single canonical identity per worktree and per task.
- Serialize risky operations (claim, merge) and surface actionable remediation.
- Normalize activity feed entries so worktree context is consistent and deduped.

## Canonical Worktree Identity
```
worktree.id    = <worker>/<task-id>
worktree.path  = <repo>/../worktrees/<worker>/<task-id>
worktree.branch= <worker>/<task-id>
worktree.commit= HEAD of the worktree
```
Invariants
- One branch + one path per task per worker.
- Branch name must match the path suffix.
- Task status `in_progress` must have exactly one active worktree; zero or many are errors.

## Guard Command (CLI entry)
`bd worktree guard [--fix] [--json]`

Responsibilities
- Detect: duplicates, missing worktree for in-progress tasks, stale heartbeats, heartbeats without worktree, branches without task, merge lock stuck.
- Validate identity: branch/path/task alignment.
- Ordering: ensure finish/merge happens only after pre-merge check passes and queue lock acquired.
- Remediation (with `--fix`): reopen stale tasks, remove orphaned worktrees, delete stale heartbeats/locks, optionally recreate missing heartbeats for active worktrees.

Implementation Hooks
- Reuse existing audit logic in `scripts/task-worktree.sh audit/status` for detection.
- Use lock files (`.beads/locks/claim-*.lock`, `.beads/merge.lock`) with flock/python fallback.
- All bd calls run with `BEADS_DIR=<repo>/.beads` and `BEADS_NO_DAEMON=1`.

## Ordering Rules
1) Claim: must hold claim lock and verify status before creating worktree/branch.
2) Work: heartbeat running; loss of heartbeat >180s triggers recovery.
3) Finish: pre-merge conflict dry-run vs origin/main, then merge queue lock, then push & cleanup.
4) Cleanup: remove worktree + branch; delete heartbeats and locks.

## Activity Feed Normalization
- Activity entries should carry `worktree.id` and `task.id` so UI can dedupe by `(task, worktree, event_type, ts)`.
- When guard fixes state, emit a synthetic event: `worktree_guard:<action>` with details (e.g., reopened task, pruned worktree path).
- VS Code/TUI should badge items with worktree id when present.

## Failure Handling Matrix
- Duplicate worktrees for same task → raise error; suggest keeping newest commit and `cleanup <worker>` others.
- in_progress task without worktree → reopen task, prune stray branches.
- Heartbeat without worktree → delete hb, optionally reopen task if status in_progress.
- Merge lock held > timeout → prompt operator to inspect PID/`lsof .beads/merge.lock`; allow forced clear with `--fix`.
- Branch/path mismatch → rename branch or recreate worktree; guard should block finish until fixed.

## Decisions
- Lock backend: flock with python+mkdir fallbacks (already in task-worktree.sh).
- Heartbeat interval/stale: 60s / 180s.
- Default worktree root: `<repo>/../worktrees/<worker>/<task>`; guard will refuse paths outside this root unless `--allow-external`.
- Guard surfaces JSON for UI surfaces (`--json`) to keep VS Code/TUI parsers simple.

## Open Questions
- Should VS Code enforce guard checks before allowing finish from the UI?
- Cross-machine agents: do we need a distributed lock (e.g., Redis) or is local FS sufficient for now?
- Should guard recreate heartbeats automatically when missing but worktree is active?
- How to version the worktree schema so future changes stay backward compatible?
