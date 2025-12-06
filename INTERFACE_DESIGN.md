# Beads VS Code Extension – Interface Design

> Updated for the VS Code-only architecture. See `docs/architecture.md` and `docs/adr/2025-12-vscode-architecture.md`.

## Layers & data flow

```
VS Code commands / trees / webviews
        │
@beads/platform-vscode
  • services/runtimeEnvironment (trust, guard, root resolution)
  • services/cliService (BdCliClient factory, --no-daemon policy)
  • providers/beads/lifecycle (store + watchers, multi-root)
  • commands/* (domain modules)
  • views/* (explorer, activity, dependency tree, graph webview)
        │
@beads/core
  • BdCliClient (retry/backoff, stderr sanitization)
  • BeadsStore (CLI-first loading, natural sort, stale detection)
  • Watcher adapters, config helpers, security utilities
        │
bd CLI --no-daemon → .beads/*.db (or issues.jsonl fallback)
```

## Contract between VS Code and core

- **Thin activation**: `extension.ts` only re-exports; `extension.main` orchestrates services/modules. No business logic lives in activation.
- **CLI safety**: all invocations go through `cliService` → `BdCliClient`, which injects `--no-daemon`, enforces retry/timeout/offline policy, and sanitizes stderr (paths/tokens/worktree ids). Mutations run the worktree guard via `runtimeEnvironment` when enabled.
- **Multi-root aware**: each workspace folder resolves its own `commandPath`, `projectRoot`, and data file. Lifecycle manages a store per workspace and keeps providers in sync.
- **Read path**: lifecycle calls `bd export` (max buffer set for graphs) and normalizes results. On CLI failure it falls back to `beady.dataFile` (JSON/JSONL) and still sorts naturally.
- **Write path**: command modules call lifecycle/cliService helpers; after mutation they refresh the store. Errors surface via VS Code notifications with sanitized messages.
- **Workspace trust**: mutation commands require trust; untrusted workspaces block edits and surface a clear message.

## Configuration surface

`beady.commandPath`, `beady.projectRoot`, `beady.dataFile` influence CLI resolution; CLI policy comes from `beady.cli.*` and `beady.offlineDetection.thresholdMs`. Extension code should never bypass these settings; services read them via VS Code configuration APIs.

## Error handling

- Missing bd/`ENOENT` → friendly message suggesting install/config path.
- Timeouts/offline thresholds → BdCliError (`timeout`/`offline`) with sanitized stderr; treated as retryable vs. fatal based on policy.
- Dependency-edit warnings → surfaced as VS Code warnings; operations are no-ops when feature flags are disabled or CLI version is too old.

## Watching & refresh

- Watch `.beads/*.db` (or the resolved JSON/JSONL file) per workspace using the core watcher adapter. Events are debounced (default 750ms) and schedule a store refresh.
- Manual refresh and command-triggered refresh both drive the same BeadsStore instance so tree/webviews and activity feed stay in sync.

## Shape of the provider interface

- Tree providers consume `BeadsStore` output (`BeadItemData[]`) and rely on core helpers (natural sort, stale detection, graph helpers, status/priority formatting).
- View modules set and clear context keys (bulk selection, quick filters, favorites, dependency editing) centrally.
- Webviews (graph) must generate HTML with CSP + nonce and validate messages against an allowlist.
- UI/tooltips must use shared sanitizers (`@beads/core` security helpers); see `docs/tooltips/hover-rules.md`.
- New commands are registered in `src/commands/*` modules; all bd calls flow through `cliService` and lifecycle rather than direct `BdCliClient` usage.
