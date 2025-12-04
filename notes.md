# To Do

- Add feedback so users can submit ideas and suggestions as github issues.
- Remove prefixes from names. Add more detail.
- Activity feed has wrong timestamps. And it doesn't seem to always update. I guess it stops at 100 events?
- Tapping on items in the activity feed fails to open anything

## Worktree audit (2025-12-04)

Findings
- Shared state lives in `.beads/` (SQLite + JSONL, locks, heartbeats). All bd calls in `scripts/task-worktree.sh` flow through `bd_cmd` with `BEADS_NO_DAEMON=1` to avoid daemon + worktree misrouting.
- Claim serialization: `.beads/locks/claim-<task>.lock` (flock/python/mkdir fallback) wraps verify+claim. Merge serialization: `.beads/merge.lock` wraps finish; pre-merge conflict dry-run added.
- Liveness: heartbeats at `.beads/heartbeats/<worker>__<task>.hb` (60s touch, 180s stale). Sweep in `status` reopens stuck tasks and prunes orphaned worktrees.
- Orchestration docs/live tooling: `scripts/task-worktree.sh`, `docs/MULTI_AGENT_ORCHESTRATION.md`, `docs/worktree-guard.md`, `scripts/stress-test.sh` (sandbox stress). VS Code extension currently has no worktree-aware code paths; worktree guard is CLI-only.

Current code paths & owners
- `scripts/task-worktree.sh` (multi-agent workflow, locks/heartbeats/merge queue) — Ops tooling.
- `docs/MULTI_AGENT_ORCHESTRATION.md` / `docs/multi-agent.md` (usage guidance) — Docs.
- `docs/worktree-guard.md` + audit subcommand inside task-worktree.sh — Ops tooling.
- `scripts/stress-test.sh` (sandbox stress harness) — Testing.

Failure matrix (selected)
- Duplicate worktrees for same task (different workers): risk of parallel commits/merges; detected by `task-worktree.sh audit` duplicate check; remediate by cleanup extra worktree and reopen task if needed.
- Task status in_progress but no worktree (crash): causes blocked task; detected by audit and stale heartbeat sweep; remediate with `cleanup <worker>` or manual reopen + prune.
- Heartbeat present but no worktree: stale liveness file can keep task blocked; audit highlights; remediate by deleting hb + reopening task.
- Missing heartbeat for active worktree: no crash detection; ensure start runs heartbeat; restart heartbeat or restart task.
- Merge queue lock left held (stuck finish): agents wait until timeout; remediate by inspecting `.beads/merge.lock` holder and re-running finish.
- Daemon on worktree (bd without BEADS_NO_DAEMON): may commit to wrong branch; enforce `bd_cmd` wrapper or export BEADS_NO_DAEMON=1.

Recommended constraints
- Always use `./scripts/task-worktree.sh start|finish` (never direct git worktree or bd) and keep `BEADS_NO_DAEMON=1`.
- Run `./scripts/task-worktree.sh status` (or `audit`) before claiming/finishing when multiple agents are active.
- Ensure heartbeats directory and locks stay gitignored (`.beads/*.lock`, `.beads/heartbeats/`).
- If a worktree crashes, prefer `cleanup <worker>` to manual deletion so locks/heartbeats are cleared.

Remediation checklist for broken worktrees
- Run `./scripts/task-worktree.sh audit` to see duplicates/missing heartbeats.
- For duplicate worktrees: keep the branch with newest commit, remove others via `cleanup <worker>` and reopen task if claim lost.
- For in_progress without worktree: `bd update <task> --status open --assignee ""` under claim lock (or rely on stale sweep), then prune worktrees (`git worktree prune`).
- For stale heartbeats: delete the hb file and rerun `status` (sweep), or `cleanup` the worker.
- For stuck merge queue: identify process holding `.beads/merge.lock`; if none, remove lock and rerun `finish`.
## Multi-agent & UI testing research (beads-vscode-arh)

### Tooling survey
- VS Code extension UI: @vscode/test-electron (official), Playwright w/ VS Code Server (experimental), vscode-extension-tester (Selenium-based, heavier).
- Ink TUI: ink-testing-library + react-test-renderer for component tests; for end-to-end, use `node-pty` or `expect`/`script` to drive a pseudo-TTY.
- Multi-agent concurrency: bash/node harness spawning task-worktree.sh + bd with temp repos; use file locks + timeouts; collect JSON traces.
- Web (future): Playwright headless Chromium with fixtures; disable by default to keep CI time manageable.

### Deadlock / race mitigations
- File locks: always use per-task and merge locks (already in task-worktree.sh); ensure harness respects lock timeouts and reports wait reasons.
- WAL for sqlite (done) + busy_timeout.
- Heartbeats with stale detection (existing) — harness should simulate missed heartbeats and verify recovery.
- Merge queue serialization (existing) — include in harness scenarios.

### CI considerations
- Headless VS Code via @vscode/test-electron; cache VS Code download to speed runs.
- Use smaller fixture data; cap events/tasks per run to keep under ~3-4 minutes.
- Matrix for different surfaces but allow `TEST_SURFACE` env to select subset.

### Sample commands/config
- VS Code integration: `npm run test:integration` (already set).
- Harness (to build): `npm run test:harness -- --agents 5 --iterations 50 --seed 42` (placeholder; to be implemented in scripts/agent-harness).
- TUI smoke (future): `npm run test:tui:smoke` using pty-based runner.
- Web skeleton (future): `npm run test:web:skeleton` behind env flag.

### Next steps (suggested)
- Implement harness runner in scripts/agent-harness: temp repo, seed tasks, spawn N agents running claim-next/finish loops, export trace JSON, assert no deadlocks.
- Add fixtures and malicious payload tests for Little Glen security alongside CSP docs (ties to vc9z/v7t8).
- Add comparison table to this note (tool vs. pros/cons vs. CI support).
