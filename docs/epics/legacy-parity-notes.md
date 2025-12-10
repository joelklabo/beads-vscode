# Legacy Issues ➜ Tasks View Parity (beads-aih)

## Objective
- Map every visible feature in the legacy **Issues (Legacy)** tree view (`beadyExplorer`) to the new **Tasks** webview (`beady.issuesView`).
- Identify gaps and assign the active implementation tasks so we can delete the legacy view once parity (or better) is reached.
- Exclude accessibility and user-facing documentation work (explicitly out of scope for this effort).

## Inventory: Legacy Issues (tree) capabilities
- **Toolbar (view/title commands)**  
  - Quick filter preset apply / clear (gated by `beady.quickFiltersEnabled`).  
  - Sort picker (`beady.sortPickerEnabled`) or toggle cycling; clear sort order.  
  - Toggle closed visibility.  
  - Search + clear search.  
  - Refresh.  
  - Create bead.  
  - Visualize dependencies.  
  - Export CSV / Export Markdown (config gated).  
  - Inline status change (config gated).  
  - Bulk actions (update status, add label, remove label) when selection & bulk enabled.  
  - Open In-Progress panel.  
  - Toggle favorite (when favorites enabled).
- **Context menu (view/item)**  
  - Edit external reference.  
  - Add dependency (when dependency editing enabled).  
  - Export CSV / Markdown.  
  - Inline status change; inline edit title/labels; edit assignee.  
  - Delete bead; bulk status / label actions; toggle favorite.
- **Tree affordances**  
  - Chevron expand/collapse on sections; persisted collapsed state.  
  - Drag/drop mime type `application/vnd.code.tree.beadyExplorer` (reorder/group).  
  - Section groupings: status, assignee, epic (plus summary header).  
  - Quick filter + search affect visible items; closed toggle filters.  
  - Status/priority/assignee badges rendered in tree items.
- **Detail view**  
  - Dependency tree shown, but dependency links are **not clickable** in the current implementation.

## Inventory: Current Tasks webview state
- **Toolbar contributions present**: quick filter apply/clear, sort picker/toggle, toggle closed, search/clear, refresh, create bead. (Shared view/title entries exist for `beady.issuesView`.)  
  - Missing toolbar parity vs legacy: visualize dependencies, export CSV/Markdown, bulk actions, favorites toggle, open In-Progress panel, clear sort order.
- **Context menu (webview/context)**: only open bead, inline status change, edit assignee. Missing external ref edit, dependency add, export, delete, bulk actions, favorites, inline edit title/labels.
- **Sections & grouping**: status/assignee/epic groupings and chevrons defined in React (`Section` component), but chevrons currently not surfacing in the Tasks list UI reported by users.
- **Density/design**: compact toggle exists; spacing/chip styles need alignment with shared theme.
- **Dependency tree links**: not clickable.

## Parity & Improvement Checklist (linked to tasks)
- [ ] **Chevrons & row affordances** — ensure visible collapsed/expanded indicators and hit targets in Tasks list (beads-dii).  
- [ ] **Toolbar parity** — restore/carry over legacy controls (refresh, collapse-all/clear sort, sort picker/toggle, search/quick filter, plus missing controls: visualize dependencies, export CSV/MD, favorites, bulk actions, open in-progress) (beads-en3; may require follow-up subtasks for exports/bulk/favorites).  
- [ ] **Visual polish & density** — align chips, spacing, compact mode, shared tokens (beads-ad7).  
- [ ] **Clickable dependency links** — dependency tree nodes in detail view open external refs safely (beads-55a).  
- [ ] **Tests** — unit/visual coverage for chevrons, toolbar, density, dependency links (beads-1xh).  
- [ ] **Remove legacy view** — delete `beadyExplorer` contribution and code after parity verified (beads-d45).

## Gaps likely needing follow-up tasks (not yet scheduled)
- Export CSV/Markdown from Tasks view (toolbar + item context).  
- Bulk actions (status/labels) + selection model in webview.  
- Favorites toggle and “Open In-Progress panel” equivalents.  
- Context menu parity: external reference edit, dependency add/remove, delete bead, inline edit title/labels.  
- Drag/drop or other reordering affordances (if still desired in Tasks view).  
- Visualize dependencies entry point from Tasks toolbar.

## References
- Contributions source: `package.json` (view/title, webview/context, view/item/context for `beadyExplorer` vs `beady.issuesView`).  
- Legacy tree provider behaviors: `src/providers/beads/treeDataProvider.ts`.  
- Tasks webview implementation: `src/views/issues/index.tsx`, `Row.tsx`, `style.css`; provider wiring `src/providers/beads/webview.ts`.  
- Detail view (dependency tree): `src/views/detail/*`.
