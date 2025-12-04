# Epic: Offline / Slow Network Resilience (beads-vscode-0z2q)

## Goals
- Keep the explorer usable when the bd CLI or network is slow/offline.
- Surface clear status and recovery actions without blocking the UI thread.
- Reuse cached data when fresh data is unavailable; avoid silent data loss.

## States & detection
- **Healthy**: last command finished under the success threshold (default 5s read / 8s write).
- **Slow**: command exceeds soft timeout (default 3s read / 5s write) → show progress + “Taking longer than usual”.
- **Offline/failed**: process error, non-zero exit, or exceeds hard timeout (default 15s read / 20s write) → mark offline until next success.
- **Stale cache**: more than `staleThresholdMinutes` since last successful refresh; badge indicates stale.
- Detection signals come from the CLI wrapper (shared with task 4xve): start/stop timestamps, exit codes, stderr patterns (ENOENT, ETIMEDOUT, ECONNREFUSED), and a watchdog timer to abort hung processes.

## UX contract
- **Status bar**
  - Healthy: hidden (current behavior) unless stale badge already shown.
  - Slow: `$(clock) Beads is slow…` tooltip: “bd responses are slow; still working. Click to open logs.”
  - Offline: `$(plug) Beads offline` tooltip: last successful time + action: “Retry now / Copy command output”. Clicking retries a refresh.
- **Explorer banner (tree)**
  - When offline: top banner row “Offline – showing cached data” with buttons `Retry`, `Open logs`, `Configure timeouts`.
  - When slow: non-blocking inline progress row that can be dismissed; tree remains interactive.
- **Commands**
  - Read commands (refresh/list) show cancellable progress with a cancel button; cancellation leaves existing data intact.
  - Write commands (create/update/label) time out at hard limit; on failure, show error with `Retry` and `Copy CLI command`. No auto-queue (out of scope).
- **Caching**
  - Keep the last successful dataset in workspaceState. On launch or offline failure, render that cache with a “stale” badge and timestamp.
  - Do not overwrite the cache on partial/failed responses.
- **Search & filters**
  - Filters/search run against the cached dataset when offline; a hint notes “Results may be stale”.
- **Activity feed**
  - When offline, show an empty-state message “Activity unavailable offline” with a retry button; keep prior events cached for 10 minutes.

## Retry / backoff policy
- First retry is manual (user clicks). Auto-retries only for reads, using exponential backoff starting at 2s, max 30s, max 3 attempts, and only while user keeps the Beads view open.
- Writes never auto-retry; they prompt the user.
- A successful command resets the offline/slow state.

## Performance expectations
- UI thread never blocked by CLI calls; always use cancellable async with a hard timeout abort.
- Tree render under 100ms using cached data; refresh recompute is debounced (250ms) when multiple events fire.
- No extra CLI calls for status badges; rely on stored metrics.

## Config hooks (align with 4xve)
- `beads.cli.readTimeoutMs` (hard), `beads.cli.readSlowMs` (soft)
- `beads.cli.writeTimeoutMs` (hard), `beads.cli.writeSlowMs` (soft)
- `beads.offline.retry.maxAttempts`, `beads.offline.retry.maxDelayMs`
- Defaults aim for safety; validation lives in the shared config helper.

## Edge cases
- **Missing CLI**: treat as offline; surface “bd not found” with install hint and copyable command.
- **Large output**: if stderr/stdout exceeds 5 MB, abort and surface “response too large; try narrowing filters”.
- **Workspace without .beads**: show “Beads project not detected” instead of offline state.
- **Mixed results**: if a batch write partially succeeds, show per-item result list; successful items refresh from cache, failed ones remain unchanged.
- **Window focus regain**: on focus, run a lightweight `bd list --limit 1 --json` probe to clear offline state without refetching everything.

## Testing checklist
- Simulate slow CLI with `sleep` wrapper; verify slow banner and cancellable progress.
- Kill bd process mid-call; confirm offline state, cache still renders, and retry works.
- Disconnect network (if bd remote) or rename bd binary; confirm “bd not found” path.
- Large dataset: ensure tree renders from cache under 100ms and banners do not flicker.
- Write timeout: ensure command aborts, shows retry/copy, and does not mutate cached list.
- Focus regain probe clears offline after successful ping.

## Implementation slices
1) **CLI wrapper**: add soft/hard timeouts, result codes, and state events (`healthy|slow|offline`).
2) **State store**: offline/slow/stale flags + lastSuccess timestamp + cached dataset in workspaceState/globalState.
3) **UI surfaces**: status bar item, explorer banner row, progress notifications, activity feed empty-state message.
4) **Retry helper**: debounced auto-retry for reads; manual retry hook for writes.
5) **Docs**: README “Offline mode” section + troubleshooting; developer note on test harness to simulate slow CLI.
