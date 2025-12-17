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
 

## Release checklist

Before publishing a release, validate the following in VS Code with at least one representative workspace:

### Keyboard-only navigation
- Beady explorer: reach all controls (views, toolbar actions, search/filter/sort) without a mouse.
- Tree navigation: arrow keys move selection predictably; Enter/Space activate the selected action; focus ring remains visible.
- Webviews/panels: focus moves into the webview, stays trapped appropriately, and returns to VS Code when closed.

### Screen reader semantics
- Views and controls have meaningful labels (commands, buttons, status badges, quick picks).
- Announcements reflect state changes (expanded/collapsed, linking mode, “closed hidden/visible”, filter mode, errors).
- Webviews expose headings/landmarks where appropriate and do not announce duplicated labels.

### Color contrast + theming
- Verify light + dark theme readability.
- Verify high-contrast / forced-colors mode does not rely on color-only meaning (status dots, dependency edges, badges).
- Icons and badges remain legible against the background and with focus outlines.

### Motion / animation
- No critical information relies only on animation.
- Respect reduced-motion settings where applicable (avoid unnecessary animated transitions in webviews).

### Errors + validation messaging
- Validation errors (invalid ids, unsafe input, disallowed transitions) are communicated via text (not only color).
- Error toasts and inline messages provide actionable guidance and are screen-reader readable.

## Known limitations
- Tree items are always expanded; Left/Right navigation only moves focus (no collapse state yet).
- Graph layout relies on scrolling for very large graphs; there is no keyboard panning shortcut beyond standard scroll behavior.
- Edge labels may overlap in very dense graphs; selection and `aria-label` text still provide direction details.
