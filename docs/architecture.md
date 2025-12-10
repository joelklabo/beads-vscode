# Beads architecture (overview)

This repo now targets a single surface: the VS Code extension. Shared logic stays in `@beads/core`; VS Code wiring lives in `@beads/platform-vscode` with lean activation and modular services/commands/views. See `docs/adr/2025-12-vscode-architecture.md` for the current plan, `docs/adr/2025-12-core-layering.md` for legacy multi-surface context, `docs/adr/2025-12-vscode-recommendations.md` for how we surface the VS Code extension to bd/`.beads` workspaces, `docs/adr/2025-12-vscode-bundling.md` for the bundling strategy, and `docs/adr/2025-12-activation-lifecycle.md` for activation/performance/CSP/size budgets.

```mermaid
graph TD
  subgraph Data
    bd[bd CLI (--no-daemon)]
    store[(.beads/*.db or issues.jsonl)]
    bd --> store
  end

  subgraph Core
    core[@beads/core\nmodels + CLI client + store/watchers + sanitizers]
  end

  subgraph VSCode
    runtime[services/runtimeEnvironment\ntrust + projectRoot + guard]
    cli[services/cliService\nBdCliClient factory]
    lifecycle[providers/beads/lifecycle\nstore + watchers]
    commands[commands/*\nper-domain modules]
    views[views/* + graph webview\ncontext keys]
  end

  core --> lifecycle
  runtime --> lifecycle
  runtime --> cli
  cli --> lifecycle
  lifecycle --> commands
  lifecycle --> views
  commands --> lifecycle
  bd --> core
  store --> core
```

## Package responsibilities (VS Code-only)
- **@beads/core**: Bead/dependency models, normalization, stale detection, BdCliClient (safe args, retry/offline thresholds, stderr sanitization), BeadsStore + watcher interfaces, config helpers, security/sanitization utilities.
- **@beads/platform-vscode**: Activation + VS Code wiring. Hosts services (`runtimeEnvironment`, `cliService`), Beads store lifecycle helpers, per-domain command modules, and view/webview registries. `extension.ts` stays thin and delegates to `extension.main`.
- **services/runtimeEnvironment**: Resolves workspace root/command path, enforces workspace trust and worktree guard before mutations, surfaces guard warnings.
- **services/cliService**: Creates BdCliClient instances with `--no-daemon`, shared retry/timeout policy, stderr sanitization, and worktree-id redaction.
- **providers/beads/lifecycle**: Owns BeadsStore creation, watchers, refresh scheduling, and multi-root selection; exposes start/stop hooks used by activation and modules.
- **commands/**: Domain-specific modules (beads CRUD/search/sort, dependency editing, exports, bulk, favorites/quick filters, inline edits) that consume lifecycle + cliService.
- **views/**: Explorer, activity feed, dependency tree, and graph webview wiring; centralizes context keys and CSP/nonce handling.

## Data flow
1. `runtimeEnvironment` resolves project root (multi-root aware) and bd command path; workspace trust + worktree guard run before any mutation.
2. `cliService` builds BdCliClient with retry/backoff + maxBuffer and sanitized stderr (`@beads/core` helpers).
3. `providers/beads/lifecycle` creates BeadsStore, loads/refreshes data (CLI first, JSON/JSONL fallback), and wires watcher adapters per workspace (debounced).
4. Command modules call lifecycle/cliService; view modules subscribe to lifecycle events and set context keys. Graph webview HTML uses CSP + nonce from the view module.

## Workspace layout & commands (after VS Code-only cleanup)
- Root install: `npm install`
- Build: `npm run build:core`, `npm run build:vscode`
- Bundle: `npm run bundle` (esbuild) outputs `dist/extension.js(+.map)`; `npm run bundle:watch` for incremental dev; `npm run typecheck` runs `tsc --noEmit`. `npm run compile` (tsc -b) remains for test builds that rely on `out/`.
- Tests: `npm run test:unit` (VS Code adapter), `npm run test:core`, `npm run test:bd-cli`, `npm run test:integration:headless`; `npm run test:all` mirrors the CI test matrix.
- Temp/test artifacts live under `tmp/`; clean with `npm run test:clean-temp`.

## Safety & security
- All bd invocations must include `--no-daemon` (cliService/BdCliClient inject it and sanitize stderr). Worktree guard runs before mutations when enabled.
- Do not write directly to `.beads` db files; always go through the CLI or BeadsStore helpers.
- See `docs/accessibility.md` (a11y checklist) and `docs/tooltips/hover-rules.md` (sanitization notes) when touching UI/tooltips.
- Activation/perf budgets: cold activation ≤100ms (measured by `check:perf`), VSIX ≤3.0 MB zipped, bundled `dist/extension.js` ≤1.5 MB, webview bundles ≤1.2 MB each, and CSP must forbid unsafe-inline/eval with nonce + `webview.cspSource` for all scripts/styles. Detailed guardrails live in `docs/adr/2025-12-activation-lifecycle.md` and are enforced in prepublish/CI.
