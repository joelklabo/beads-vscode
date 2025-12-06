# Continuous Integration

The README badges link to the GitHub Actions **Test** workflow and Codecov coverage reported from the Linux/stable/Node 20 coverage job.

## Workflows & badges
- Workflow: `.github/workflows/test.yml` (push to `main`/`develop`, pull requests, manual dispatch).
- Jobs: `lint` (ci:lint + size check), `test` matrix (ci:unit + ci:integration), `coverage` (ci:coverage on Ubuntu/stable/Node 20), `package` (vsix artifact).
- Badge: `https://github.com/joelklabo/beady/actions/workflows/test.yml/badge.svg?branch=main`.
- Concurrency: cancel-in-progress per workflow/ref to avoid duplicate PR runs.

## Matrix
- OS: Ubuntu, macOS, Windows
- Node: 18.x and 20.x
- VS Code channel: stable on all OSes; insiders on Linux (enable elsewhere when available).
- Job name shows the tuple (OS / Node / channel).

## Headless integration tests
- Linux jobs wrap integration tests in `xvfb-run -a npm run test:integration:headless`.
- Non-Linux jobs reuse the same headless script (focus-suppressing launch args, no XVFB needed).
- Each job sets `VSCODE_TEST_CHANNEL` and a unique `VSCODE_TEST_INSTANCE_ID` so temp dirs never collide.

## Coverage
- Run `npm run ci:coverage` to produce text + LCOV reports in `coverage/` (open `coverage/lcov-report/index.html`).
- CI runs the same command on Ubuntu (Node 20, stable channel) and uploads `coverage/lcov.info` to Codecov plus an artifact.
- Coverage artifacts are git-ignored (`coverage/`, `.nyc_output`, `coverage-final.json`).

## Local parity scripts
- `npm run ci:verify` — lint + localization + compile + unit + headless integration (matches CI steps).
- `npm run ci:lint` — eslint + localization hygiene.
- `npm run ci:unit` — compiled unit suite only.
- `npm run ci:integration` — single headless integration pass (set `VSCODE_TEST_CHANNEL` / `VSCODE_TEST_INSTANCE_ID` as needed).
- Run these from your task worktree root (`./scripts/task-worktree.sh verify <task-id>`) to avoid writing into the main repo; set a unique `VSCODE_TEST_INSTANCE_ID` when running multiple terminals/worktrees in parallel.

## Artifacts & isolation
- Test outputs (`out/` and `.vscode-test/`) upload as `test-results-<os>-node<version>-<channel>`.
- Temp dirs are keyed by `VSCODE_TEST_INSTANCE_ID`; the cleanup script `npm run test:clean-temp` purges stale runs.
