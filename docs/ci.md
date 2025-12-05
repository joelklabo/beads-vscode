# CI and coverage plan

Design contract so GitHub Actions mirrors local npm scripts and exposes coverage.

## Goals
- Use the existing npm scripts as the single source of truth (no ad-hoc CI commands).
- Fast feedback (lint/unit) with heavier suites (integration) isolated.
- Publish coverage (lcov + summary) for badges and PR comments.

## Job layout (GitHub Actions)
- **lint**: `npm ci` → `npm run lint`. Runs on `ubuntu-latest`; caches npm via `actions/setup-node` (`cache: 'npm'`).
- **unit**: `npm ci` → `npm run test:unit`. Generates coverage with `c8` wrapper (see Coverage section). Upload `coverage/lcov.info` as artifact.
- **bd-cli**: `npm ci` → `npm run test:bd-cli` (serial after unit). Shares node/npm cache.
- **integration (VS Code)**: `npm ci` → `npm run test:integration`. Uses `ELECTRON_DISABLE_GPU=1` and `CI=true`. Matrix later can add insiders channel; default is stable.
- **tui**: `npm ci` → `npm run test:tui` (headless tsx tests). Can run in parallel with integration.
- **package (optional)**: `npm ci` → `npm run package` for release verification.

Job dependencies: lint → unit → bd-cli; integration and tui can run after lint. All jobs upload junit-ish stdout and relevant artifacts for debugging.

## Coverage
- Tool: **c8** (ships with Node 18) wrapping the `npm run test:unit` and `npm run test:bd-cli` invocations: `c8 -r lcov -r text-summary npm run test:unit`.
- Outputs: `coverage/lcov.info` + `coverage/coverage-final.json` + text summary in logs.
- Upload to Codecov using `CODECOV_TOKEN` secret; fallback to storing artifact when token is absent.
- Badge: README to reference Codecov project badge once pipeline lands.

## Permissions & secrets
- Workflow permissions: `contents: read`, `pull-requests: write` (only for status/badge comments), `checks: write` if annotating lint failures.
- Secrets: `CODECOV_TOKEN` (coverage upload). No other secrets required.

## Environment & caching
- Use `actions/setup-node@v4` with `.nvmrc` or `node-version: 18`, `cache: 'npm'` (keyed by lockfile hash).
- Set `CI=true`, `BEADS_NO_DAEMON=1`, and `VSCODE_CHANNEL=stable` for integration job.
- Clean tmp VS Code test directories between runs (`rm -rf .vscode-test` on cache miss).

## Local parity
- Developers run the same commands:
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:bd-cli`
  - `npm run test:integration`
  - `npm run test:tui`
- Coverage locally: `npx c8 -r lcov -r text-summary npm run test:unit`.

## Artifacts
- `coverage/lcov.info` (unit/bd-cli)
- VS Code test logs (`.vscode-test/logs` zipped) for integration failures
- `npm-debug.log` if present
