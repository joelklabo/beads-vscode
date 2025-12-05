# CI and Coverage Entrypoints

Guidance so CI mirrors local npm scripts and surfaces coverage artifacts.

## NPM CI scripts
- `npm run ci:lint`
- `npm run ci:test`
- `npm run ci:integration`
- `npm run ci:coverage`
- `npm run ci:package`

## Job layout (GitHub Actions)
- **lint**: `npm ci` → `npm run ci:lint` (ubuntu). Cache npm via `actions/setup-node@v4` (`cache: 'npm'`).
- **unit + bd-cli**: `npm run ci:test` (unit then bd-cli). Upload stdout and failures.
- **integration (VS Code)**: `npm run ci:integration` with `CI=true`, `ELECTRON_DISABLE_GPU=1`. Add headless args per `docs/testing-headless.md`. Matrix can add insiders later.
- **coverage**: `npm run ci:coverage` (c8 lcov + text-summary) and upload `coverage/lcov.info`. If `CODECOV_TOKEN` set, push to Codecov; otherwise store artifact.
- **tui**: optional parallel job `npm run test:tui`.
- **package**: `npm run ci:package` for release verification (optional gate).

## Coverage settings
- Tool: `npx c8 -r lcov -r text-summary` wrapping unit and bd-cli suites.
- Outputs: `coverage/lcov.info`, `coverage/coverage-final.json`, text summary in logs.
- Badge: once pipeline lands, add README Codecov badge pointing to repo project.

## Environment & caching
- Node 18 via `actions/setup-node@v4`, `cache: 'npm'` keyed by lockfile hash.
- Common env: `CI=true`, `BEADS_NO_DAEMON=1`, `VSCODE_TEST_CHANNEL=stable` for integration.
- Clean `.vscode-test` on cache miss or channel change to avoid corrupted state.

## Local parity
- Developers run the same scripts locally: `npm run ci:lint`, `npm run ci:test`, `npm run ci:integration`, `npm run ci:coverage`, `npm run ci:package`.
- Headless guidance lives in `docs/testing-headless.md`.
