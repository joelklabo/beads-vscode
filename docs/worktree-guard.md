# Worktree Guard Audit

Quick health check to keep multi-agent worktrees safe and in sync.

## Usage

```bash
./scripts/task-worktree.sh audit
```

What it checks:

- Duplicate worktrees for the same task (different workers)
- In-progress tasks with no worktree
- Worktrees whose tasks are not marked in_progress
- Heartbeat files without worktrees, and worktrees missing heartbeats

Remediation hints are printed if issues are found.

Run this before/after heavy agent activity or when you suspect orphaned worktrees.
