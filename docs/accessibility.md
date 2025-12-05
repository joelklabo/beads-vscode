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

## Known limitations
- Tree items are always expanded; Left/Right navigation only moves focus (no collapse state yet).
- Graph layout relies on scrolling for very large graphs; there is no keyboard panning shortcut beyond standard scroll behavior.
- Edge labels may overlap in very dense graphs; selection and `aria-label` text still provide direction details.
