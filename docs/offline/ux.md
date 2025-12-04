# Offline & CLI Resiliency

This extension relies on the `bd` CLI for most operations. To avoid hanging the UI when the CLI is slow or unreachable, we expose configurable timeouts and retry/backoff controls.

## Defaults

- `beads.cli.timeoutMs` **15,000 ms** – per-attempt timeout for any `bd` invocation.
- `beads.cli.retryCount` **1** – one retry is attempted after a timeout. Set to `0` to disable retries.
- `beads.cli.retryBackoffMs` **500 ms** – delay before each retry (multiplied by attempt index).
- `beads.offlineDetection.thresholdMs` **30,000 ms** – total elapsed time across attempts before treating the CLI as offline and surfacing an error.

These values are intentionally conservative to prevent VS Code from blocking for long periods while still giving the CLI a second chance to respond.

## Behavior

- Each `bd` call is wrapped with the timeout and retry policy above.
- Retries only occur for timeout/transient process errors; permanent failures still surface immediately.
- If the total elapsed time exceeds `beads.offlineDetection.thresholdMs`, the call is aborted and marked as offline to avoid indefinite waits.

Adjust these settings in VS Code → Settings → “Beads” if your environment requires longer or shorter windows.
