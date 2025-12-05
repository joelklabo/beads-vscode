# ADR: Core layering for multi-surface Beads clients

- Status: Proposed
- Date: 2025-12-05
- Owner: TheArchitect
- Related issues: beads-9ja (epic), beads-vhj (this ADR), beads-7li (workspaces), beads-721/9qv/abb/y17 (core + UI packages)

## Context
- The VS Code extension currently concentrates domain logic, CLI calls, data shaping, and UI wiring in `src/extension.ts` (~5.9k LOC), making sharing with the existing Ink TUI and planned web client difficult.
- We need a reusable, testable foundation that works across three renderers: VS Code (Node + VS Code APIs), Web (React DOM), and TUI (Ink renderer on Node). Each surface must respect worktree safety (`--no-daemon`, guards) and handle multi-root workspaces.
- Offline/slow CLI scenarios and bd versions without dependency-edit support must degrade gracefully.

## Decision
Adopt a layered, package-based architecture inside the monorepo. Core logic is renderer- and platform-agnostic; thin adapters integrate with each UI surface.

### Package layout
- `packages/core`: domain models (beads, dependencies, statuses), normalization, natural sorting, stale detection, CLI client (safe arg injection + retry/offline policy), file-store + watchers (pluggable adapters), security/sanitization helpers, shared config parsing.
- `packages/ui-headless`: renderer-neutral React hooks/state machines over `core` (view models for list/detail/graph/favorites, actions for update/label/deps). Accept injected adapters for fs/watch, timers, open-url, clipboard, notifications.
- `packages/ui-web`: React DOM presentational components (list/detail/graph/badges) consuming `ui-headless` view models + theme tokens. Ships ARIA/focus handling; no business logic.
- `packages/ui-ink`: Ink components mapping `ui-headless` view models to terminal primitives; keyboard via `useInput/useFocus`; color-safe text fallbacks.
- `packages/platform-vscode`: activation wiring, command registration, VS Code tree/webviews binding to `core` store + `ui-headless` hooks; no domain logic in `extension.ts`.
- `web/`: Vite app wiring `ui-web`; uses Node adapter to bd CLI or mock data flag for CI.
- `tui/`: Ink app wiring `ui-ink`; reuses worktree guard + CLI client.

### Allowed dependencies (acyclic)
- `core`: only stdlib/Node, no React/VS Code/Ink/DOM.
- `ui-headless`: `core` + React; no DOM/Ink/VS Code.
- `ui-web`: `ui-headless` -> `core`; React DOM only.
- `ui-ink`: `ui-headless` -> `core`; Ink only.
- `platform-vscode`: `core` + `ui-headless`; VS Code APIs allowed; must not depend on `ui-web`/`ui-ink`.
- Apps (`web/`, `tui/`): depend on their renderer package + `ui-headless` + `core`.

### Data flow
1. Platform adapter resolves project root (multi-root aware) and finds `bd` command path.
2. `core` CLI client executes bd with `--no-daemon`, retry/backoff, maxBuffer; errors sanitized.
3. `core` store loads/export data, normalizes beads, builds dependency graph, emits events.
4. `ui-headless` hooks subscribe to store and expose view models + actions.
5. Renderer packages (`ui-web` / `ui-ink`) render view models; platform adapters handle surface-specific IO (e.g., VS Code notifications, web modals, terminal keymaps).

### Migration rules
- Move business logic out of `src/extension.ts`; keep activation + wiring only.
- New commands go in `packages/platform-vscode` (or surface-specific adapter) and call `core`/`ui-headless`.
- Shared helpers stay in `core`; avoid duplicating graph/worktree logic in TUI/web.
- Feature flags live in `core` config where possible; UI reads exposed capability state.

### Multi-root & worktree safety
- All store/CLI functions accept `workspaceId/rootPath` and never pull VS Code globals directly.
- Worktree guard lives in `core` helper, invoked by platform adapters before mutations.
- BEADS_DIR default remains repo `.beads`; adapters may override per workspace.

### Offline/compatibility
- CLI client classifies errors: timeout, offline threshold, missing binary, version too old for dependency editing. Surfaces show actionable messages.
- Dependency-edit feature stays gated behind version check (>=0.29.0) exposed by `core`.

### Testing strategy
- `core`: mocha/unit for normalization, CLI client retry, store/watchers.
- `ui-headless`: React Testing Library hooks + adapter fakes.
- `ui-web`: RTL for rendering/ARIA.
- `ui-ink`: ink-testing-library for key handling/render.
- VS Code adapter: existing integration harness reused after refactor.

### Risks / mitigations
- Bundle size (web): enforce tree-shaking; keep `core` free of VS Code/Ink deps.
- Duplicate bd installs: prefer single dependency in root workspace; document in `tsconfig.base`/workspaces.
- Terminal a11y limits: provide text fallbacks and keymap help via `ui-ink`.

## Consequences
- Clear dependency DAG enables parallel work (core, headless hooks, web/ink renderers).
- `extension.ts` shrinks and becomes replaceable wiring.
- Web/TUI can ship quickly using shared logic; future surfaces (e.g., desktop) reuse headless hooks.
