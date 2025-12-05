# Continuous Integration

This repository runs a single `Test` workflow (`.github/workflows/test.yml`) on push, pull requests, and manual dispatch.

## Matrix & Coverage
- OS: Ubuntu, macOS, Windows
- Node: 18.x and 20.x
- VS Code channel: stable on all OSes; insiders is exercised on Linux (the channel can be enabled elsewhere if/when supported).
- Job name shows the full tuple: OS / Node / channel.

## Headless integration tests
- Linux jobs wrap integration tests in `xvfb-run -a npm run test:integration:headless`.
- Non-Linux jobs reuse the harness’ focus-suppressing launch args and the same headless script (no XVFB needed).
- Each job exports `VSCODE_TEST_CHANNEL` to select the VS Code build and `VSCODE_TEST_INSTANCE_ID` (derived from run id + matrix) so temp `user-data-dir` and `extensions-dir` never collide between jobs.

## Artifacts & isolation
- Test outputs (`out/` and `.vscode-test/`) upload as `test-results-<os>-node<version>-<channel>` for easy lookup.
- Concurrency is enabled with `cancel-in-progress` for the workflow/ref pair to avoid queued duplicates on PR updates.

## Reproducing locally
Run the same steps as CI before opening a PR:

```bash
npm ci
npm run lint
npm run compile
npm run test:unit
VSCODE_TEST_CHANNEL=stable npm run test:integration:headless
VSCODE_TEST_CHANNEL=insiders npm run test:integration:headless  # optional when insiders is installed
```

Pass your own `VSCODE_TEST_INSTANCE_ID` when running tests in multiple terminals to keep temp dirs separate (defaults to a random UUID if omitted).
