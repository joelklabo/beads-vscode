# Epic: Favorites & Pinned Beads (beads-vscode-auyr)

## Goal
Let users mark beads as favorites for quick access in the explorer, with reliable persistence (label-backed or local), keyboard accessibility, and clear refresh behavior.

## Feature shape
- **Feature flag**: `beads.favorites.enabled` (default off for rollout). When off, hide commands, menus, and favorites section.
- **Entry points**: command palette (“Beads: Toggle Favorite”), context menu on bead rows, keybinding (suggested `Cmd/Ctrl+K, F`), and optional toolbar button in explorer.
- **Favorites section**: pinned list at top of explorer when enabled and non-empty; sorted by manual pin order or updatedAt fallback; shows stale/blocked badges like normal rows.
- **State indicator**: star icon filled for favorited items; tooltip “Favorited — click to unpin”.

## Persistence modes
1) **Label-backed (sync)**: uses a configurable label name (default `favorite`). `bd label add/remove` per bead; keeps favorites synced with CLI/other machines. Requires bd availability.
2) **Local fallback**: stores favorite IDs in `workspaceState` when label mode disabled or bd unavailable; optional auto-migrate to labels when CLI returns.
- Setting: `beads.favorites.mode` = `label` | `local` | `auto` (prefer label, fallback local). Validate and log mode choice.
- Conflict handling: if label removed externally, drop from favorites on next refresh; if both label + local contain item, treat as favorite.

## UX & interactions
- Toggling updates icon immediately (optimistic), then confirms on success; failure reverts and surfaces error with Retry/Copy CLI command.
- Favorites section supports multi-select operations identical to main list; manual sort unaffected.
- Empty state: “No favorites yet. Use Toggle Favorite to pin a bead.”
- Keyboard: toggle via command; section focusable; screen reader announces “Favorited” state.

## Refresh behavior
- Refresh listeners watch bd events and label changes; favorites list recomputed after every list refresh.
- When in local mode, favorites survive reload via workspaceState; when mode switches to label, attempt migration and report result.

## Edge cases
- **CLI unavailable**: auto-switch to local (if mode=auto) with notification; stay in local until a successful label write.
- **Duplicate toggles**: no-op when already favorited/unfavorited; guard against rapid double clicks.
- **Cross-workspace**: favorites scoped per workspace folder; multi-root shows favorites per active workspace selection.
- **Stale items**: stale/blocked badges render inside favorites; section respects filters/search.

## Testing checklist
- Toggle favorite success/failure (label mode and local mode) with mocks for bd.
- Migration: start in local, switch to label, ensure items copied and local cleared.
- Offline: toggle shows fallback/local mode and resumes label mode after reconnect.
- Multi-select toggle with partial failures reports per-item result and refreshes list.
- Accessibility: keyboard toggle, screen reader announcements, tooltip updates.

## Implementation slices
1) Settings & flag wiring (`beads.favorites.enabled`, `beads.favorites.mode`, `beads.favorites.labelName`).
2) Storage helper: label + local persistence with conflict resolution and migration helper.
3) UI wiring: commands/menus, star icon, favorites section rendering and sorting.
4) Refresh + event hooks: update favorites on bd watcher events and list refreshes.
5) Tests + docs: unit tests for storage helper; README section describing modes/limits.
