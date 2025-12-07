# Deployment Guide

## VS Code extension

- Build: `npm run compile`
- Bundle: `npm run bundle` (produces `dist/extension.js`)
- Package: `npm run package` (produces `*.vsix`)
- Publish: `vsce publish` with a Personal Access Token that has Marketplace scope.
- CI: `.github/workflows/test.yml` runs lint, unit/integration tests, and packages the VSIX artifact.

## BD CLI usage in CI

- All CI jobs export `BEADS_NO_DAEMON=1` so bd commands always run in direct mode and avoid shared daemon state.
