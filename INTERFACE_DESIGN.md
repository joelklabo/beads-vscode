# Beads VS Code Extension – Interface Design

> Also see `docs/architecture.md` (overview) and `docs/adr/2025-12-core-layering.md` (full rationale).

## Layers & data flow

```
VS Code commands/tree/webviews
        │
@beads/platform-vscode (activation/wiring)
        │
@beads/core
  • BdCliClient (adds --no-daemon, retry/backoff, stderr sanitization)
  • BeadsStore (CLI-first loading, file fallback, natural sort, stale detection)
  • Watcher adapters (per-workspace debounce)
        │
bd CLI → .beads/*.db (or issues.jsonl fallback)
```

## Contract between VS Code and core

- **Activation only in `extension.ts`**: activation/deactivation wire up providers and commands; domain logic lives in `extension.main` + core packages.
- **CLI safety**: all invocations go through `BdCliClient` which injects `--no-daemon`, validates args, applies retry/timeout/offline thresholds, and sanitizes stderr (paths/tokens). Mutations run the worktree guard when enabled.
- **Multi-root aware**: each workspace folder resolves its own `commandPath`, `projectRoot`, and data file. Watchers are scoped per root to avoid cross-talk.
- **Read path**: BeadsStore calls `bd export` (max buffer set for graphs) and normalizes results. On CLI failure it falls back to `beady.dataFile` (JSON/JSONL) and still sorts naturally.
- **Write path**: command helpers (`runBdCommand`, bulk/inline edits, dependency add/remove) call BdCliClient and then refresh the store. Errors are surfaced via VS Code notifications with sanitized messages.
- **Workspace trust**: mutation commands check workspace trust/worktree guard before invoking bd.

## Configuration surface

`beady.commandPath`, `beady.projectRoot`, `beady.dataFile` influence CLI resolution; CLI policy comes from `beady.cli.*` and `beady.offlineDetection.thresholdMs`. Extension code should never bypass these settings.

## Error handling

- `ENOENT` / missing bd → friendly message suggesting install/config path.
- Timeouts / offline thresholds → BdCliError(`timeout`/`offline`) with sanitized stderr; treated as retryable vs. fatal based on policy.
- Dependency-edit warnings → surfaced as VS Code warnings; operations are no-ops when feature flags are disabled or CLI version is too old.

## Watching & refresh

- Watch `.beads/*.db` (or the resolved JSON/JSONL file) per workspace using the core watcher adapter. Events are debounced (default 750ms) and schedule a store refresh.
- Manual refresh and command-triggered refresh both drive the same BeadsStore instance so tree/webviews and activity feed stay in sync.

## Shape of the provider interface

- Tree providers consume `BeadsStore` output (`BeadItemData[]`) and rely on core helpers (natural sort, stale detection, graph helpers, status/priority formatting).
- UI/tooltips must use the shared sanitizers (`@beads/core` security helpers); see `docs/tooltips/hover-rules.md`.
- When adding new commands, register them via `packages/platform-vscode` and route all bd calls through the shared helpers above.
