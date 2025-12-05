# CI workflow layout

This repo's GitHub Actions workflow (`.github/workflows/test.yml`) mirrors local npm scripts, with hardening for least privilege and deterministic builds.

## Jobs
- **lint** (ubuntu): `npm ci`, `npm run lint`, and `node scripts/l10n-check.js`.
- **unit** (matrix ubuntu/macos/windows × Node 18/20): `npm ci`, install bd via `go install`, then `npm run test:unit` and `npm run test:bd-cli`.
- **integration** (ubuntu): headless VS Code via `xvfb-run -a npm run test:integration`, with `BEADS_NO_DAEMON=1` and `ELECTRON_DISABLE_GPU=1`.
- **package** (ubuntu): `npm run compile` and `npm run package`, uploading the VSIX.

## Shared settings
- Permissions: default read-only (`contents: read`, `pull-requests: read`); dependency review grants `security-events: write` only for that workflow.
- Concurrency: cancel in-progress runs per ref (`ci-${{ github.workflow }}-${{ github.ref }}`).
- Caching: `actions/setup-node@v4` with `cache: npm`; Go via `actions/setup-go@v5`.
- Env: `BEADS_NO_DAEMON=1` in test jobs; integration also sets `ELECTRON_DISABLE_GPU=1` and uses the stable VS Code channel.
- Artifacts: unit failures upload `npm-debug.log` and `out/`; integration always uploads `.vscode-test/`, `out/`, and `npm-debug.log`; package uploads the VSIX.

## Local parity
Run the same commands locally as CI:
- `npm run lint`
- `npm run test:unit`
- `npm run test:bd-cli`
- `npm run test:integration`
- `npm run package` (optional release check)

## Hardening notes
- All actions pinned to immutable commit SHAs (checkout, setup-node, setup-go, upload-artifact, dependency-review).
- Dependency review runs on PRs with minimal permissions and pinned action.
- Concurrency prevents duplicate runs on the same ref.
