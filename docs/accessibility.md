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
- Summary header row uses `role=text` and a single aria-label that contains the counts (open/blocked/in progress/closed plus assignees). Screen readers no longer announce duplicate labels.
- The “closed items” toggle always reflects its state in the explorer description (Closed visible/Closed hidden) so state is announced without relying on color or the toolbar icon.
- Assignee dots keep their emoji swatch but aria-label text announces the assignee name, count, and swatch color to avoid color-only meaning. Counts remain visible with sufficient contrast.

## Sort picker and assignee grouping
- Sort control surfaces the current mode in the explorer description (e.g., "Sort: Status (grouped)") so screen readers announce it; avoid color-only cues in the toolbar. When a Quick Pick is shown, include the current mode in the title/placeholder.
- Assignee sections (and assignee rows) announce assignee name and item count (e.g., "Assignee Ada — 3 items"); the Unassigned bucket is labeled explicitly.
- Section icons use VS Code theme colors plus text; focus outlines remain visible in high-contrast/forced-colors modes.
- Assignee labels used for UI, aria-labels, and collapse state are sanitized; aria-label keeps the full sanitized name even when the visible label is truncated.
 
## TUI visual reports
- Visual test reports include alt text for every snapshot/diff image, tabbable sections, and visible focus outlines. Headings and preformatted blocks are keyboard reachable (Tab/Shift+Tab) and screen-reader friendly.
- Raw frame logs and report text are sanitized with the shared redaction helper to strip tokens, emails, absolute paths, and worktree ids before saving artifacts.
- The visual harness refuses to run outside a task worktree unless `TUI_VISUAL_ALLOW_NON_WORKTREE=1` is set. Keep bd calls gated with `BEADS_NO_DAEMON=1` if they are ever enabled in the harness.

## Known limitations
- Tree items are always expanded; Left/Right navigation only moves focus (no collapse state yet).
- Graph layout relies on scrolling for very large graphs; there is no keyboard panning shortcut beyond standard scroll behavior.
- Edge labels may overlap in very dense graphs; selection and `aria-label` text still provide direction details.
