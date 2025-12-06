# Agent workflow (multi-worker)

- **Always work in a task worktree** via `./scripts/task-worktree.sh start <worker> <task-id>`; never edit `/Users/honk/code/beady` directly. Verify with `./scripts/task-worktree.sh verify <task-id>` before editing/running tests.
- **Pick tasks that avoid file conflicts**: check `npx bd --no-daemon list --status in_progress --json` and skip tasks touching the same `## Files`.
- **bd safety**: every bd call must include `--no-daemon` (use the shared BdCliClient/helpers). Run the worktree guard script before mutations when enabled.
- **Workspace layout**: shared logic lives in `packages/core` and `packages/ui-headless`; VS Code wiring in `packages/platform-vscode`; renderer shells in `web/` and `tui/`. See `docs/architecture.md` for the layered rules.
- **Tests/CI**: `npm run test:unit` for VS Code, `npm run test:core`, `npm run test:tui`, `npm run test:web:skeleton`; `npm run test:all` for the full sweep. Clean temp dirs with `npm run test:clean-temp`.
- **Docs & a11y/security**: link to `docs/accessibility.md` when touching UI and `docs/tooltips/hover-rules.md` for sanitization. Keep README/QUICKSTART/INTERFACE_DESIGN aligned with architecture and --no-daemon guidance.
- **Finishing**: commit with the task id, then run `./scripts/task-worktree.sh finish <worker> <task-id>` (handles rebase/merge/cleanup). If abandoning, clean up the worktree and reopen the task in bd.
