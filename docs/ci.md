# CI workflow layout

This repo's GitHub Actions workflow (`.github/workflows/test.yml`) mirrors local npm scripts and keeps jobs focused for speed and clarity.

## Jobs
- **lint** (ubuntu): install with `npm ci`, run `npm run lint` and `node scripts/l10n-check.js`.
- **unit** (matrix: ubuntu/macos/windows × Node 18/20): `npm ci`, install bd via `go install`, then `npm run test:unit` and `npm run test:bd-cli`.
- **integration** (ubuntu): headless VS Code via `xvfb-run -a npm run test:integration`, with bd installed and `BEADS_NO_DAEMON=1`.
- **package** (ubuntu): after tests, run `npm run compile` + `npm run package` and upload the VSIX.

## Shared settings
- Permissions: `contents: read`, `pull-requests: read`.
- Concurrency: cancel in-progress runs per ref (`${{ github.workflow }}-${{ github.ref }}`).
- Caching: `actions/setup-node@v4` with `cache: npm` per job; Go via `actions/setup-go@v5`.
- Env: `BEADS_NO_DAEMON=1` in test jobs; integration also sets `ELECTRON_DISABLE_GPU=1` and defaults to the stable VS Code channel.
- Artifacts: failing unit jobs upload `npm-debug.log` and `out/`; integration always uploads `.vscode-test/`, `out/`, and `npm-debug.log`; package job uploads the built VSIX.

## Local parity
Run the same commands locally as the workflow:
- `npm run lint`
- `npm run test:unit`
- `npm run test:bd-cli`
- `npm run test:integration`
- `npm run package` (optional release check)
