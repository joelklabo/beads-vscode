# Headless & Channel-Specific Integration Tests

Use these npm scripts to run VS Code integration tests without stealing focus and with isolated temp data per run.

## Scripts
- `npm run test:integration:stable` — compiles then runs integration tests against VS Code Stable with a fresh instance ID.
- `npm run test:integration:insiders` — same as above but forces the Insiders channel.
- `npm run test:integration:headless` — wraps the stable run in `xvfb-run -a` on Linux for true headless execution; uses the same focus-suppressing launch args on macOS/Windows.

## Environment
- `VSCODE_TEST_CHANNEL` is set by the scripts (defaults to `stable`); override to try other channels.
- `VSCODE_TEST_INSTANCE_ID` is generated per invocation to isolate temp `user-data-dir` and `extensions-dir`. Set it yourself to group logs or parallel runs.
- Temp directories are created under the repo `tmp/` directory (not `/tmp`) and include the sanitized instance ID.

## Notes
- Linux requires `xvfb-run` for headless runs; the script falls back to a normal run on other platforms.
- The test harness already adds Electron flags (`--disable-features=CalculateNativeWinOcclusion`, `--disable-renderer-backgrounding`, etc.) to avoid foregrounding windows on macOS/Windows.
- All scripts compile first (`npm run compile`) and then execute `node ./out/test/runTest.js` with the prepared environment.

## Parallel runs
- Always set a unique `VSCODE_TEST_INSTANCE_ID` when running multiple terminals or CI shards so each run gets its own `tmp/beady-<id>-*` directory.
- Instance IDs are sanitized; prefer short alphanumerics plus dashes/underscores.

## Cleanup
- Remove stale temp directories with `npm run test:clean-temp` (runs `scripts/cleanup-temp-tests.sh`).
- The harness cleans up after each run, but the cleanup script is handy after aborted jobs.
