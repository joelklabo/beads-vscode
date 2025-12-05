# Beads architecture (overview)

This repo is a multi-surface monorepo. Logic lives in shared packages; thin adapters light up each surface (VS Code, web, TUI). See `docs/adr/2025-12-core-layering.md` for the full ADR.

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

  subgraph Headless
    headless[@beads/ui-headless\nReact hooks/view-models]
  end

  subgraph Platforms
    vscode[@beads/platform-vscode\nactivation + VS Code wiring]
    web[web/ (Vite) + @beads/web]
    tui[@beads/tui (Ink)]
  end

  core --> headless
  headless --> vscode
  headless --> web
  headless --> tui
  bd --> core
  store --> core
```

## Package responsibilities
- **@beads/core**: Bead/dependency models, normalization, stale detection, BdCliClient (safe args, retry/offline thresholds, stderr sanitization), BeadsStore + watcher interfaces, config helpers, security/sanitization utilities.
- **@beads/ui-headless**: Renderer-neutral React hooks and actions over the core store/CLI. Accepts adapters for fs/watch, timers, open-url, clipboard, and notifications.
- **@beads/platform-vscode**: Activation + command registration, VS Code tree/webviews bound to the core store/headless hooks. No domain logic in `extension.ts`; all bd calls enforce `--no-daemon`.
- **@beads/web**: Vite/React DOM shell consuming `ui-headless`; Node adapter to bd CLI or mock data for CI.
- **@beads/tui**: Ink renderer consuming `ui-headless`; reuses worktree guard and shared CLI client. CLI path + workspace root come from the same config helpers as VS Code/web, and bd mutations run through `runGuardedBd` (worktree guard + `--no-daemon`).

## Data flow
1. Platform resolves project root (multi-root aware) and bd command path; worktree guard + `--no-daemon` enforced before mutations.
2. BdCliClient executes bd with retry/backoff + maxBuffer; stderr is sanitized (tokens/paths) using `@beads/core` sanitizers.
3. BeadsStore loads/refreshes data (CLI first, JSON/JSONL fallback), normalizes beads, and emits updates; watcher adapters debounce filesystem events per workspace.
4. `ui-headless` hooks subscribe to the store and expose view models/actions. Renderer packages render those models; platform adapters own surface-specific IO (VS Code notifications, browser modals, terminal keymaps).

## Workspace layout & commands
- Root install: `npm install`
- Build per surface: `npm run build:core`, `npm run build:vscode`, `npm run build:tui`, `npm run build:web` (web build skips when the workspace is absent).
- Tests: `npm run test:unit` (VS Code), `npm run test:core`, `npm run test:tui`, `npm run test:web:skeleton`, `npm run test:all` for the full sweep. CI entrypoints mirror these (`ci:*`).
- Temp/test artifacts live under `tmp/`; clean with `npm run test:clean-temp`.

## Safety & security
- All bd invocations must include `--no-daemon` (BdCliClient injects it and sanitizes stderr). Worktree guard scripts run before mutating commands when enabled.
- Do not write directly to `.beads` db files; always go through the CLI or BeadsStore helpers.
- See `docs/accessibility.md` (a11y checklist) and `docs/tooltips/hover-rules.md` (sanitization notes) when touching UI/tooltips.
