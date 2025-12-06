# Deployment Guide

## VS Code extension
- Build: `npm run compile`
- Package: `npm run package` (produces `*.vsix`)
- Publish: `vsce publish` with a Personal Access Token that has Marketplace scope.
- CI: `.github/workflows/test.yml` runs lint, unit/integration tests, and packages the VSIX artifact.

## Web shell (future)
- Guarded optional step in CI: `npm run ci:web` only runs when a web workspace exists.
- Local dev (once web package lands): `npm run web:dev` (or equivalent) to start Vite dev server.
- Bundle output should remain under the agreed size threshold enforced by `scripts/size-check.js`.

## TUI
- Optional CI step: `npm run ci:tui` builds/tests the Ink TUI when the workspace is present.
- Visual suite (opt-in): set `VISUAL_TUI=1` (or pass `visual_tui=true` on `workflow_dispatch`) to run `npm run ci:tui:visual`. Artifacts are uploaded from `tmp/tui-visual-report` (HTML + PNG diffs). Skips entirely when the flag is off.

## BD CLI usage in CI
- All CI jobs export `BEADS_NO_DAEMON=1` so bd commands always run in direct mode and avoid shared daemon state.
