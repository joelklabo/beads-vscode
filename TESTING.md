# Testing Guide for Beads VSCode Extension

## One-liners
- `npm run ci:verify` — lint + localization + compile + unit + headless integration (mirrors the CI Test workflow).
- `npm run ci:coverage` — runs the unit suite under c8 and writes text + LCOV reports to `coverage/`.
- `npm run test:clean-temp` — purge stale temp dirs from prior headless/integration runs.

## Unit tests
- Location: `src/test/unit/` (plus a few compiled helpers under `out/test/*`).
- Run: `npm run test:unit` (compiles then executes `npm run test:unit:run`).
- Coverage: `npm run ci:coverage` and open `coverage/lcov-report/index.html`.

## Integration tests (headless by default)
- Primary command: `npm run test:integration:headless` (uses `xvfb-run -a` on Linux; reuses focus-suppressing args on macOS/Windows).
- Channels: set `VSCODE_TEST_CHANNEL=stable|insiders` or use `npm run test:integration:stable` / `npm run test:integration:insiders` helpers.
- Isolation: set `VSCODE_TEST_INSTANCE_ID` to keep `user-data-dir` / `extensions-dir` unique when running in multiple terminals or worktrees. The env helper cleans these on exit; `npm run test:clean-temp` is available for stale runs.

## Worktrees
Run tests from your task worktree (not the main repo). Verify with `./scripts/task-worktree.sh verify <task-id>` before running commands so temp state stays scoped.

## CI parity & badges
The GitHub Actions **Test** workflow uses the same commands as `npm run ci:unit` + `npm run ci:integration` across an OS/Node/VS Code channel matrix, with coverage reported via `ci:coverage` on Ubuntu/Node 20/stable and uploaded to Codecov. Badges and matrix details live in [docs/ci.md](docs/ci.md).
