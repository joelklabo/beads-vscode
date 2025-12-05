# Headless & Multi-Agent Integration Test Strategy

Design guidance for running VS Code integration tests headlessly, without stealing focus, and safely in parallel across agents/CI.

## Goals
- Default to headless/non-foreground execution on all OSes.
- Isolate concurrent runs (unique temp dirs and instance IDs) to avoid lock/file clashes.
- Allow stable vs insiders selection via env, not code changes.
- Keep commands aligned with existing npm scripts; CI should mirror local usage.

## Per-OS launch strategy
- **Linux**: wrap `npm run test:integration` with `xvfb-run -a` when a display is not available. Set `DISPLAY` if runner already provides X. Pass `--disable-gpu`, `--disable-dev-shm-usage`, `--disable-features=CalculateNativeWinOcclusion` for stability.
- **macOS / Windows**: use VS Code launch args to avoid foreground: `--disable-gpu`, `--disable-renderer-backgrounding`, `--disable-features=CalculateNativeWinOcclusion`, `--crash-reporter-directory` pointing to temp. Do not rely on a visible window.
- All OSes: prefer `VSCODE_CHANNEL`/`VSCODE_TEST_CHANNEL` to pick the binary (default `stable`; `insiders` allowed).

## Isolation & temp dirs
- Derive an instance id from `VSCODE_TEST_INSTANCE_ID` or fallback to `$(date +%s)-$RANDOM`.
- Temp roots: `tmp/integration/<instance>/user-data` and `tmp/integration/<instance>/extensions` (workspace-relative and gitignored). Ensure creation before launch; remove after run.
- When running in CI, include `<matrix.os>-<channel>-<attempt>` in the instance id for easier debugging.

## Env vars (suggested)
- `VSCODE_TEST_CHANNEL`: `stable` | `insiders` (default `stable`).
- `VSCODE_TEST_INSTANCE_ID`: unique token for temp dirs and logs.
- `ELECTRON_DISABLE_GPU=1`, `CI=true`, `BEADS_NO_DAEMON=1` for consistency with other suites.

## Launch args (pass to `runTests`)
- `--disable-gpu --disable-dev-shm-usage --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`
- Consider `--log=error` to reduce noise; keep crash dumps in per-instance temp path.

## Cleanup rules
- Always remove `tmp/integration/<instance>` after run (even on failure). Keep crash logs as artifacts in CI by zipping the instance dir before deletion when a failure occurs.
- Clear `.vscode-test` when channel/binary changes or when a run crashes to avoid reuse of corrupted state.

## CI matrix suggestion
- Run headless on `ubuntu-latest` (xvfb), `macos-latest`, `windows-latest`.
- Channels: start with `stable`; add `insiders` as a second job once scripts land.
- Artifacts: VS Code logs, crash dumps, and temp dir listing for the instance id.

## Local usage sketch
```
# stable, isolated run
VSCODE_TEST_INSTANCE_ID=local-$(date +%s) npm run test:integration

# insiders channel on linux headless
VSCODE_TEST_CHANNEL=insiders VSCODE_TEST_INSTANCE_ID=ci-linux npm run test:integration
# (wrap with xvfb-run -a if DISPLAY is missing)
```

## Open follow-ups (for beads-g5p / beads-56k)
- Wire scripts: `test:integration:stable`, `test:integration:insiders`, `test:integration:headless` (xvfb wrapper).
- Harness updates: generate temp dirs, resolve channel binary, and pass launch args automatically.
- Badge/README updates after matrix is enabled.
