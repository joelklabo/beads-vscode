# Epic: Little Glen Glance (rev15) (beads-vscode-bjvb)

## Goal
Surface a fast “glance” panel/hover inside VS Code that shows dependencies, blockers, stale status, recent activity, and quick actions without leaving the explorer.

## UX outline
- **Entry points**: hover on bead row (lightweight tooltip) and a dedicated “Glance” panel (tree sibling or panel view). Feature flag `beads.littleGlen.enabled` default off.
- **Glance panel layout** (target <300ms render from cache):
  1) **Header**: title + status pill + stale badge if applicable; open/refresh buttons.
  2) **Deps/Blockers strip**: up to 3 upstream + 3 downstream chips with status color; “View all” opens dependency graph.
  3) **Stale/aging meter**: relative time since last update, threshold color coding.
  4) **Recent activity**: last 3 events (status change, comment, label). Truncates long text; clickable to open activity feed.
  5) **Quick actions**: open bead, visualize deps, refresh, copy link/id.
- **Hover card**: minimal: title, status, stale badge, first blocker/dependency, “Open Glance” CTA.
- **Accessibility**: all actions keyboard-focusable; ARIA labels reflect status + stale; high-contrast uses neutral outlines.

## Data & performance
- Primary source: cached bead list + dependency map already loaded by explorer; no extra bd calls on open.
- On-demand fetch: if dependency/activity data missing, use a single lightweight `bd show <id> --json` with a 3s soft timeout; show skeleton while loading; abort if slow (align with offline resilience policy).
- Cache: memoize glance payload per bead in workspaceState with `updatedAt` guard; invalidate on bd watcher events, manual refresh, or stale threshold.
- Budget: <300ms to render from cache, <800ms for fresh fetch. UI always shows skeleton if fetch exceeds 150ms.

## Feature flag & fallback
- Setting: `beads.littleGlen.enabled` (default false). When disabled, hide hover card and panel contributions.
- Safe fallback: if data missing or fetch fails, show friendly empty state with Retry + “Open in explorer”.
- Rollback: flag can be flipped without reload; contributions re-register only when enabled.

## Interaction details
- “Visualize deps” opens existing dependency graph view if available; otherwise quick-pick to choose related command.
- Quick actions reuse existing commands; glance should not duplicate logic—only delegate.
- Activity events displayed with relative time and sanitized markdown; clicking opens activity feed at that item.

## Telemetry / logging
- No new telemetry. Log (output channel) only: glance open, cache miss/hit, fetch duration, failures (redacted).

## Testing checklist
- Cache hit renders under 300ms; cache miss still shows skeleton and completes under 800ms with valid data.
- Offline mode: panel shows cached data + offline banner, retry button obeys retry policy.
- Stale items display badge in header and stale meter uses configured threshold.
- Deps/Blockers chips show correct status colors and truncate gracefully.
- Accessibility: keyboard tab order covers all quick actions; screen reader announces status + stale state.
- Feature flag off hides hover and panel; toggling on shows without reload.

## Implementation slices
1) Data adapter: build glance payload from bead list + optional bd show fetch; cache layer.
2) UI components: hover markdown card + webview/panel renderer (reuse existing sanitizers, no remote assets).
3) Status/flag wiring: enablement checks in contributions; command to open glance with selected bead.
4) Tests: unit for payload builder + cache invalidation; integration/manual for performance and accessibility.
