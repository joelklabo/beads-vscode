# Testing Guide for Beads VSCode Extension

## One-liners

- `npm run test:bundle` — compile + bundle + stubbed load of `dist/extension.js` to catch missing externals early.
- `npm run check:vsix-size` — packages a VSIX to a temp file and fails if it exceeds the ADR budget (override with `VSIX_MAX_BYTES`).
- `npm run test:all` — lint + VS Code unit + core unit + bd-cli sanity.
- `npm run ci:verify` — lint + localization + compile + unit + headless integration (mirrors the CI Test workflow).
- `npm run ci:coverage` — runs the unit suite under c8 and writes text + LCOV reports to `coverage/` (coverage includes `src/**`, `packages/**/src/**`; excludes `out/test/**`).
- `npm run test:clean-temp` — purge stale temp dirs from prior headless/integration runs.

## Unit tests

- Location: `src/test/unit/` (plus a few compiled helpers under `out/test/*`).
- Run: `npm run test:unit` (compiles then executes `npm run test:unit:run`).
- Coverage: `npm run ci:coverage` and open `coverage/lcov-report/index.html`.

### Test categories

- **Services**: `runtimeEnvironment.test.ts` (workspace trust, worktree guard), `cliService.test.ts` (error formatting, bead ID resolution)
- **Commands**: `commands.registry.test.ts` (command registration system)
- **Views**: `graph.view.test.ts` (graph view helpers, message validation)
- **Core**: `utils.test.ts`, `beads-store.test.ts`, `cli-client.test.ts`

## Bundle smoke test

- Location: `src/test/bundle.smoke.test.ts` (compiled to `out/test/bundle.smoke.test.js`).
- Run: `npm run test:bundle` (compiles, bundles, then loads the bundled module with a stubbed VS Code host to catch missing externals).

## VSIX size gate

- Command: `npm run check:vsix-size` (requires dist to exist; uses `VSIX_MAX_BYTES` to override the ADR budget).
- Produces a VSIX in a temp directory, reports zipped size, and exits non-zero on budget violations.

## Workspace package tests

- Core: `npm run test:core` (node:test via tsx; exercises `packages/core/src/**` including CLI client sanitization).

## Stale / Warning bucket checks

- Unit coverage lives in `src/test/unit/extension.test.ts` (warning excludes closed tasks/epics and handles empty epics). Run `npm run test:unit -- --grep "stale"` for a focused pass.
- Manual spot-check: set `beady.staleThresholdMinutes` low, mark a task `in_progress`, wait past the threshold, and confirm it shows in Warning; closing the item should drop it from Warning immediately.
- Empty epics behave the same way: an open empty epic shows in Warning, but closing it moves it to Closed and keeps it out of Warning across refreshes.

## Integration tests (headless by default)

- Location: `src/test/suite/` (extension tests, CLI integration, views, filters)
- Primary command: `npm run test:integration:headless` (uses `xvfb-run -a` on Linux; reuses focus-suppressing args on macOS/Windows).
- Channels: set `VSCODE_TEST_CHANNEL=stable|insiders` or use `npm run test:integration:stable` / `npm run test:integration:insiders` helpers.
- Isolation: set `VSCODE_TEST_INSTANCE_ID` to keep `user-data-dir` / `extensions-dir` unique when running in multiple terminals or worktrees. The env helper cleans these on exit; `npm run test:clean-temp` is available for stale runs.

### Integration test files

- `extension.test.ts` — activation, command registration, view contribution points
- `views.test.ts` — view configuration, graph webview integration
- `integration.test.ts` — bd CLI operations (create, update, close, labels)
- `dependencyTree.test.ts` — dependency tree flows
- `filters-assignee.test.ts` — assignee filtering

## Worktrees

Run tests from your task worktree (not the main repo). Verify with `./scripts/task-worktree.sh verify <task-id>` before running commands so temp state stays scoped. Temp artifacts live under `tmp/` in the repo; avoid `/tmp` so macOS permissions prompts are not trigger- Isolation: set `VSCODE_TEST_INSTANCE_ID` ons **Test** workflow uses the same commands as `npm run ci:unit` + `npm run ci:integration` across
### Integration test files

- `extension.test.ts` — activation, command registration, view contribution points
- `views.test.ts` — view configurats live in [docs/ci.md](docs/ci.md).
