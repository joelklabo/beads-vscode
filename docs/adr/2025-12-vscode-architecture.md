# ADR: VS Code-only architecture and extension split

- Status: Accepted
- Date: 2025-12-06
- Owner: bart-noir
- Related issues: beads-12v (epic), beads-dm8 (this ADR), beads-da9 (tooling cleanup), beads-45k/udx/yje/ksb (module extraction), beads-8qw/0xw/z8d/886 (security, deployment, docs)

## Context
- The repo previously supported three surfaces (VS Code, web, TUI) with shared `ui-headless` hooks and renderer shells. The VS Code extension carried most logic inside `src/extension.main.ts` (~6.2k LOC), making it hard to test, slow to load, and risky to change.
- We are intentionally de-scoping to a single surface (VS Code) to simplify the toolchain, reduce bundle size, and focus testing/quality. Web/TUI workspaces and their headless packages are being removed.
- We still need clear module seams so the extension host stays responsive, worktree/`--no-daemon` safety remains enforced, and future contributors know where to put logic.

## Decision
1. **Single-surface scope**: Ship only the VS Code extension. Remove `web/`, `tui/`, `packages/ui-web`, and `packages/ui-headless` from workspaces, scripts, and path mappings. Authoritative packages become `@beads/core` and `@beads/platform-vscode`.
2. **Thin activation, modular runtime**:
   - `src/extension.ts` stays a shim that re-exports `extension.main`.
   - `src/extension.main.ts` becomes orchestration only: construct services, register modules, wire disposables.
   - New services:
     - `services/runtimeEnvironment`: workspace trust + projectRoot resolution + worktree guard orchestration.
     - `services/cliService`: BdCliClient factory (inject `--no-daemon`, policy, error sanitization, worktree id tagging).
     - `providers/beads/lifecycle` (or similar): BeadsStore creation, watcher wiring, refresh scheduling, multi-root selection.
   - Feature modules:
     - `commands/*`: grouped by domain (beads CRUD/search/sort, dependencies, exports, bulk, favorites/quick-filters, inline edits).
     - `views/*`: explorer, activity feed, dependency tree, graph webview (HTML/CSP/nonce + message handlers).
   - Context keys and telemetry stay centralized; no module touches BdCliClient directly except through cliService.
3. **Dependency rules (acyclic)**:
   - `@beads/core` stays UI-agnostic (models, CLI client, store, sanitizers, config helpers).
   - `services/*` may depend on `@beads/core` and VS Code APIs; `commands/*` and `views/*` depend on services + lifecycle, not on raw CLI.
   - `extension.main` depends on services/commands/views registries only.
4. **Testing strategy**:
   - Unit: host-less tests for runtimeEnvironment, cliService, lifecycle, and one happy/error path per command module. Use stubs for VS Code APIs and CLI.
   - Integration: reuse `@vscode/test-electron` harness to validate activation, context keys, views/webview messaging, and multi-root selection.
   - Security: regression tests for trust gating, CSP nonce, and sanitized CLI/webview messages.
5. **Performance and safety**:
   - Lazy-load heavy modules where possible (graph webview assets, bulk actions).
   - All mutating commands require workspace trust + worktree guard before invoking bd.
   - Default CLI policy keeps `--no-daemon`, retry/backoff, and maxBuffer consistent across modules.

## Data flow (target)
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
    runtime[services/runtimeEnvironment]
    cli[services/cliService]
    lifecycle[providers/beads/lifecycle]
    cmds[commands/*]
    views[views/* + graph webview]
  end

  core --> lifecycle
  runtime --> lifecycle
  runtime --> cli
  cli --> lifecycle
  lifecycle --> cmds
  lifecycle --> views
  cmds --> lifecycle
```

## Migration/extraction sequence (mirrors bd tasks)
1. Design (this ADR) — file/layout agreements, dependency rules, diagrams.
2. Tooling cleanup (beads-da9) — remove web/TUI workspaces/scripts/paths.
3. Source deletion (beads-y8l) — delete web/tui/ui-web/ui-headless trees + stray scripts.
4. Services split (beads-45k) — create runtimeEnvironment + cliService; extension.main delegates.
5. Store lifecycle (beads-udx) — move BeadsStore/watchers into lifecycle module; expose start/stop hooks.
6. Commands modularization (beads-yje) — per-domain command modules + registry.
7. Views modularization (beads-ksb) — explorer/activity/dependency/graph view registries; CSP/nonce handled in graph module.
8. Security hardening (beads-8qw) — trust gating, sanitization, webview validation, config validation.
9. Tests (beads-8qz, beads-008) — unit + integration coverage on new seams.
10. Docs + deployment (beads-zd8, beads-0xw, beads-886) — update docs, CI/bundle scripts, accessibility checklist.

## Consequences
- Extension activation stays lean; business logic moves into testable modules.
- Tooling/CI simplify (no web/TUI builds); VSIX size and activation time improve.
- Clear seams for future contributors; commands/views cannot bypass trust/guard/CLI policy.

## Open questions
- ~~Should we keep a small compatibility shim for former headless consumers (e.g., a thin adapter in `@beads/core`)?~~ Resolved: removed; reintroduce only if needed.
- ~~How to stage removal of root scripts without breaking existing CI while tasks land?~~ Resolved: web/TUI scripts removed.
- Do we need a feature flag to disable the dependency graph webview for air-gapped environments? If yes, add to package.json contributes in the security hardening task.
