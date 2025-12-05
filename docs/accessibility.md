# Accessibility behaviors

This document summarizes the accessibility affordances for dependency visualization in the extension.

## Dependency tree (issue detail view)
- The tree container uses `role=tree`; each dependency row is a `treeitem` with `aria-level`, `aria-expanded`, and an `aria-label` that includes the id, title, status, direction (upstream/downstream), and dependency type.
- Rows are keyboard reachable with roving `tabindex`; the first row receives focus by default. Arrow Up/Down move between rows, Right moves to the first child, Left moves to the parent. Enter/Space opens the selected bead.
- Remove buttons keep their default focus order and include explicit `aria-label` text (`Remove dependency <source> → <target>`).
- Visual status is no longer color-only: rows render a text status badge alongside the colored dot, and focus outlines are visible. In high-contrast (`forced-colors`) mode the status dot gains a border and the row focus ring uses system colors.

## Dependency graph (visualize dependencies)
- Graph controls (`Reset view`, `Auto layout`, `Remove dependency`) have `aria-label` attributes. The link hint is a `role=status` live region so screen readers announce linking mode changes.
- Nodes are focusable buttons with `aria-label` that includes id, title, status, and upstream/downstream counts. Enter/Space opens the bead; `A` starts linking from the focused node. Context menu is available via Shift+F10 / ContextMenu key.
- Edges are keyboard focusable and carry `aria-label/aria-labelledby` text (e.g., `ABC → XYZ (blocks)`). Blocks edges are dashed, and every edge also renders a visible text label so direction is not color-dependent.
- Delete removes the selected edge when editing is enabled; Escape cancels link mode. A legend callout clarifies that arrowheads and labels read as source → target.
- High-contrast mode replaces color-only cues with outlines/dashes for nodes and edges.

## Filters, badges, and expanded rows
- Filter mode picker exposes an explicit title/aria label; toolbar button still uses the command title so screen readers announce it as a filter control. Use arrow keys and Enter/Space inside the picker.
- Status badges in the bead detail view are buttons with aria-haspopup="listbox"; Enter/Space or click opens the list, Escape closes it, and Arrow Down focuses the first option. Options set aria-selected and accept Enter/Space.
- Badges include a text label plus a geometric glyph (◆) and keep visible focus outlines. In high contrast mode badges pick up a system border.
- Dependency tree rows include aria-expanded and show a left border when expanded; focus rings and CanvasText outlines remain visible in forced-colors.
- Tree items announce assignee and status through accessibility labels so status/assignee cues are not color-only.


## Known limitations
- Tree items are always expanded; Left/Right navigation only moves focus (no collapse state yet).
- Graph layout relies on scrolling for very large graphs; there is no keyboard panning shortcut beyond standard scroll behavior.
- Edge labels may overlap in very dense graphs; selection and `aria-label` text still provide direction details.

## Web shell baseline (Dec 5, 2025)
- Bead list uses `role=listbox` with roving focus; arrow keys, Home/End move the active option and Enter/Space activate. Buttons keep visible focus outlines.
- Graph region exposes a keyboard alternative to drag: Tab to focus, arrows/Home/End move between nodes, Enter/Space start/finish a link, Esc cancels. Announcements are voiced through a live region and edges are available as a text list.
- Focus indicators use high-contrast outlines and never rely on color alone. Pills/badges include text labels and `aria-busy` flags convey loading state.
- Keymap help panel documents keyboard equivalents for navigation, search, and linking; rendered as text so screen readers read the shortcuts.

## TUI baseline (Dec 5, 2025)
- All panels print explicit text labels (e.g., active tab state, worktree id) so meaning is not color-only. Selection markers use text (`sel`) instead of glyph-only arrows.
- Activity feed rows include issue id, actor, worktree, and relative time in plain text; colored icons are decorative.
- Nav bar shows "active tab" inside the hotkey hint to avoid relying on Unicode bullets. The `?` key toggles an inline keymap help box; `g d/i/a/g/s` and arrows continue to work.
- Dependency graph view already supports keyboard panning/zoom/export and uses textual warnings for cycles.

## Quick manual test script
1. Web shell: `npm run web:dev` → open the served page, Tab through header controls, arrow through the bead list, focus the graph and use Enter to start/finish a keyboard link. Confirm focus outlines stay visible and the Keymap panel reads shortcuts.
2. Web mock build (CI-safe): `npm run test:web:skeleton`.
3. TUI: `npm run -w @beads/tui test` (for automated coverage) then run `npm exec tsx tui/src/app.tsx`; press `?` to toggle keymap help, arrows/`g` keys to navigate, and verify selected rows announce via text not color.

## Checklist for contributors
- [ ] Focus outlines remain visible on all interactive elements (buttons, list options, graph nodes).
- [ ] No color-only cues; every state change has accompanying text.
- [ ] Keyboard alternatives exist for pointer/drag actions (graph linking and navigation).
- [ ] Keymap/help text is discoverable from the UI (no docs-only shortcuts).
- [ ] Screen-reader or text-only modes reveal the same status/content as visual modes.
