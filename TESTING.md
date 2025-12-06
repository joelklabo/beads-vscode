# Testing Guide for Beads VSCode Extension

## One-liners
- `npm run test:bundle` — compile + bundle + stubbed load of `dist/extension.js` to catch missing externals early.
- `npm run check:vsix-size` — packages a VSIX to a temp file and fails if it exceeds the ADR budget (override with `VSIX_MAX_BYTES`).
- `npm run test:all` — lint + VS Code unit + core unit + TUI + web smoke + bd-cli sanity.
- `npm run ci:verify` — lint + localization + compile + unit + headless integration (mirrors the CI Test workflow).
- `npm run ci:coverage` — runs the unit suite under c8 and writes text + LCOV reports to `coverage/` (coverage includes `src/**`, `packages/**/src/**`, `tui/src/**`, `web/src/**`; excludes `out/test/**`).
- `npm run test:clean-temp` — purge stale temp dirs from prior headless/integration runs.

## Unit tests
- Location: `src/test/unit/` (plus a few compiled helpers under `out/test/*`).
- Run: `npm run test:unit` (compiles then executes `npm run test:unit:run`).
- Coverage: `npm run ci:coverage` and open `coverage/lcov-report/index.html`.

## Bundle smoke test
- Location: `src/test/bundle.smoke.test.ts` (compiled to `out/test/bundle.smoke.test.js`).
- Run: `npm run test:bundle` (compiles, bundles, then loads the bundled module with a stubbed VS Code host to catch missing externals).

## VSIX size gate
- Command: `npm run check:vsix-size` (requires dist to exist; uses `VSIX_MAX_BYTES` to override the ADR budget).
- Produces a VSIX in a temp directory, reports zipped size, and exits non-zero on budget violations.

## Workspace package tests
- Core: `npm run test:core` (node:test via tsx; exercises `packages/core/src/**` including CLI client sanitization).
- TUI: `npm run test:tui` (delegates to the `@beads/tui` workspace script and runs the Ink nav/events/graph suites).
- Web smoke: `npm run test:web:skeleton` (builds `@beads/web` with `tsc -b`; skips if the web workspace is missing).

## TUI visual snapshots (headless harness)
- Run from a task worktree (verify with `./scripts/task-worktree.sh verify <task-id>`); heavy deps stay gated behind `TUI_VISUAL_ENABLED=1`.
- Build artifacts once: `npm run -w @beads/tui build`, then dry-run the harness:  
  `node tui/out/test-harness/ptyRunner.js --scenario nav-basic --cols 100 --rows 30`  
  → writes `tmp/tui-harness/nav-basic.ansi` plus `nav-basic.json` metadata (sanitized + worktree-path redacted).
- Terminal determinism: harness sets `TERM=xterm-256color`, `TZ=UTC`, freezes `Date.now` when `TUI_HARNESS_CLOCK_MS` is provided; override size with `--cols/--rows`.
- Approve/compare flow (once infra scripts are wired):  
  `npm run test:tui:visual` (fails on diffs, saves report under `tmp/tui-visual-report/<scenario>/`)  
  `npm run test:tui:visual -- --update` (refreshes baselines in `tui/__snapshots__/baseline`).
- Accessibility & safety: HTML reports follow [docs/accessibility.md](docs/accessibility.md); stdout is sanitized before writing artifacts. See the design notes in [docs/design/tui-visual-testing.md](docs/design/tui-visual-testing.md) for troubleshooting fonts, terminal size, or disabling the suite when tooling is unavailable.

## Stale / Warning bucket checks
- Unit coverage lives in `src/test/unit/extension.test.ts` (warning excludes closed tasks/epics and handles empty epics). Run `npm run test:unit -- --grep "stale"` for a focused pass.
- Manual spot-check: set `beads.staleThresholdMinutes` low, mark a task `in_progress`, wait past the threshold, and confirm it shows in Warning; closing the item should drop it from Warning immediately.
- Empty epics behave the same way: an open empty epic shows in Warning, but closing it moves it to Closed and keeps it out of Warning across refreshes.

## Integration tests (headless by default)
- Primary command: `npm run test:integration:headless` (uses `xvfb-run -a` on Linux; reuses focus-suppressing args on macOS/Windows).
- Channels: set `VSCODE_TEST_CHANNEL=stable|insiders` or use `npm run test:integration:stable` / `npm run test:integration:insiders` helpers.
- Isolation: set `VSCODE_TEST_INSTANCE_ID` to keep `user-data-dir` / `extensions-dir` unique when running in multiple terminals or worktrees. The env helper cleans these on exit; `npm run test:clean-temp` is available for stale runs.

## Worktrees
Run tests from your task worktree (not the main repo). Verify with `./scripts/task-worktree.sh verify <task-id>` before running commands so temp state stays scoped. Temp artifacts live under `tmp/` in the repo; avoid `/tmp` so macOS permissions prompts are not triggered.

## CI parity & badges
The GitHub Actions **Test** workflow uses the same commands as `npm run ci:unit` + `npm run ci:integration` across an OS/Node/VS Code channel matrix, with coverage reported via `ci:coverage` on Ubuntu/Node 20/stable and uploaded to Codecov. Badges and matrix details live in [docs/ci.md](docs/ci.md).
