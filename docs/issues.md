# Issues view reference (VS Code)

This page summarizes the Issues tree view features for the VS Code Beady extension.

## Shipped Features (epic beads-4yj)

### Hide/Show Closed Toggle
- Toolbar button toggles visibility of closed items
- State persists in workspaceState across sessions
- Works with search queries and quick filter presets
- Context key: `beady.closedHidden`

### Assignee Edit
- Context menu: right-click any issue → "Edit Assignee"
- Detail panel: click "Edit Assignee" button
- Input validation: HTML/JS sanitized, max length enforced
- Empty input clears the assignee
- Uses `bd --no-daemon update <id> --assignee <name>`

### Sort Mode Picker
- Toolbar button: click the filter icon → select mode
- Command: `Beady: Choose Sort Mode`
- Modes: ID (natural), Status (grouped), Epic (grouped), Assignee (grouped)
- **Deprecated**: `beady.sortPicker.enabled` setting no longer used; picker always available
- The old cycle-sort button has been removed

### Assignee/Status Badges
- Every row displays an assignee pill (colored by hash) and status badge
- Status badge shows emoji indicator: 🟢 closed, 🟡 in progress, 🔴 blocked, 🔵 open
- Badges visible even when row is collapsed

### Expandable Rows
- Click chevron or press Space/Enter to expand
- Shows: labels, priority, external reference, last updated
- Focus order and aria-expanded stay in sync

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `beady.sortPicker.enabled` | `true` | **Deprecated** – sort picker is now always enabled |
| `beady.staleThresholdMinutes` | `10` | Minutes before in-progress tasks appear in stale warning |

## Worktree/CLI Notes

All bd CLI mutations use `--no-daemon` per the worktree guard rules. See `docs/worktree-guard.md`.

## Related design docs

- Sort picker and assignee grouping: [`docs/design/sort-assignee-grouping.md`](design/sort-assignee-grouping.md)
- Issues layout, header, and toggles: [`docs/design/issues-view.md`](design/issues-view.md)

## Implementation tasks (completed)

- ✅ Assignee grouping & badges: beads-8mt
- ✅ Assignee edit flow: beads-bx7
- ✅ Hide/show closed toggle: beads-cyp
- ✅ Cycle-sort button removal: beads-y5q
- Header row & denser layout: beads-o33 (future)
- Icon refresh: beads-bzb (future)

Keep future work in sync with worktree/--no-daemon rules from `docs/worktree-guard.md` and accessibility guidance in `docs/accessibility.md`.
