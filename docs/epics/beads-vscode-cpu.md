# Epic: Robust multi-agent & UI testing (beads-vscode-cpu)

## Objective
Deliver a robust, multi-surface testing stack that proves the system is safe for multiple agents, deadlock-free, and UI-stable across VS Code, Ink TUI, and future web surfaces.

## Scope slices
- **Concurrency harness**: simulate >5 agents with randomized bd/task-worktree ops; capture traces and detect deadlocks/races.
- **VS Code UI coverage**: extend integration suite for list/search/detail/mutate flows; keep headless-friendly.
- **TUI coverage**: smoke-level rendering/navigation tests under pseudo-tty; parity with VS Code core flows.
- **Web placeholder**: Playwright skeleton to unblock future web UI.

## Milestones
1) Harness skeleton
- Add `scripts/agent-harness/` with a dry-run simulator that operates on a temp .beads dir and fake git repo.
- Deterministic seed support; JSON trace output.
- Basic assertions: no deadlock (process completes), no unhandled errors.

2) VS Code integration coverage
- Expand `test:integration` suite with coverage for create/update/close, search, sort, stale badge, epic tree.
- CI-friendly timeouts and headless flags; reuse existing fixtures.

3) TUI smoke tests (placeholder)
- Add `packages/tui-test/README.md` with commands to run the Ink app in headless mode via `script` or `expect`.
- Minimal stub test that boots the TUI and exits cleanly (no crashes) when invoked with `npm run test:tui:smoke`.

4) Web skeleton
- Playwright config + single placeholder test hitting a static page; disabled by default behind env flag.

## Acceptance tracking
- [ ] Concurrency harness sim >5 agents, exits cleanly, writes trace
- [ ] VS Code UI core flows covered in CI
- [ ] TUI smoke test runs without crash in CI
- [ ] Playwright skeleton exists (flagged off)

## Open questions / risks
- How to safely simulate multi-agent without touching real project tasks? Proposed: temp git repo + temp .beads per run.
- CI time budget: headless VS Code + harness may be slow; need gating via dedicated npm scripts.
- TUI entrypoint path and command still in flux.

## Next steps
- [ ] Scaffold harness dir with README and placeholder runner that sets up temp repo/.beads
- [ ] Add npm scripts: `test:harness`, `test:tui:smoke`, `test:web:skeleton` (web disabled by default)
- [ ] Wire harness into CI matrix (follow-up PR)
