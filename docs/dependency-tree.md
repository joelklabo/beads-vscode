# Dependency tree editing

Design for inspecting and editing dependency directionality inside the VS Code extension. The feature is gated by `beads.enableDependencyEditing` and requires `bd >= 0.29.0`; editing controls stay hidden otherwise.

See also: the short how-to sections in [README](../README.md#dependency-tree-editing-preview) and [QUICKSTART](../QUICKSTART.md#4-dependency-editing-optional).

## Quick usage
- Turn on `beads.enableDependencyEditing` (read-only view when off). CLI calls run with `--no-daemon` and guard against cycles/duplicates/self-links.
- Open the **Dependency Tree** view; selecting an issue in the main Beads tree (or running **Beads: Dependency Tree: Pick Root**) sets the focus.
- Use the view toolbar actions **Add Upstream** / **Add Downstream** (or right-click the corresponding group header) to add links via a quick pick; the picker filters out the current issue and reuses bd `dep add` for the chosen direction.
- Remove links from the context menu on a dependency node (or the command palette / detail panel remove buttons); this calls `bd dep remove` and refreshes the tree/graph.
- Keyboard and screen reader affordances follow the VS Code tree defaults plus the behaviors documented below.

## Goals
- Provide a collapsible tree that shows which beads block the current one (upstream) and which are blocked by it (downstream).
- Allow adding or removing dependencies with immediate refresh and friendly validation.
- Keep the experience keyboard- and screen-reader-accessible.

## Data contract
- **Fetch**: `bd deps <id> --json --no-daemon` -> `{ upstream: IssueSummary[], downstream: IssueSummary[] }` where `IssueSummary` includes `id`, `title`, `status`, `type`, `labels`, `updatedAt`.
- **Add**: `bd dependency add <from> <to> --no-daemon`.
  - Upstream add: `<to>` blocks `<from>` (the current bead becomes dependent on `<to>`).
  - Downstream add: `<from>` blocks `<to>` (the current bead is set as a blocker of `<to>`).
- **Remove**: `bd dependency remove <from> <to> --no-daemon` with the same direction mapping.
- **Version guard**: run `bd --version` once per session; if older than 0.29.0, surface a warning and render the tree read-only.
- **Refresh rule**: after any mutation, rerun both `bd show <id> --json` (to update badges/status) and `bd deps <id> --json` before re-rendering.

## UI structure
- **Header**: title, stale warning (when bd fetch exceeds freshness threshold), and `Refresh` action. When editing is enabled, show `+ Upstream` and `+ Downstream` buttons.
- **Sections**: two top-level groups labeled `Upstream (blocks this)` and `Downstream (blocked by this)`, each a `role=group` under the tree.
- **Nodes**: primary line `ID - title`; secondary line `status / type`. Badges: status color dot, type icon, and a small `Up`/`Down` pill when nodes appear in mixed lists (search/quick pick). Hover/focus reveals a `Remove` icon button when editing is allowed.
- **Empty states**: "No upstream dependencies" / "No downstream dependencies" with a link to add one (only when editing is enabled).

## Interaction flows
- **Add upstream/downstream**
  1) User clicks the respective `+` button (or triggers its keyboard shortcut).
  2) Quick pick opens, filterable by id/title; prefilter current bead out.
  3) Client validation: reject self-link, duplicate edge, or locally detected cycle. Show inline error and keep the picker open.
  4) Call the matching `bd dependency add ... --no-daemon` command.
  5) On success, announce and refetch tree/data; on failure, show stderr and keep focus on the picker.
- **Remove dependency**
  1) User activates the `Remove` icon (or context menu entry) on a node.
  2) Optional confirm dialog when in downstream section (default on when `beads.confirmDestructive` is true).
  3) Call `bd dependency remove ... --no-daemon`; refresh and re-announce.
- **Refresh**: button in header plus auto-refresh after any mutation or when file watcher notices `.beads/*.db` changes.

## Keyboard and screen reader behavior
- Tree container: `role=tree`; nodes: `role=treeitem` with `aria-level` set to depth (1 for section items). `aria-expanded` reflects collapse state.
- Focus order: header title -> Refresh -> add buttons -> tree items in document order. Add buttons remain reachable even when sections are collapsed.
- Keys: Up/Down move focus; Left collapses or moves to parent; Right expands; Enter/Space activates default node action (open bead); `Shift+Delete` or `Backspace` activates Remove when its button has focus; `Ctrl+U`/`Ctrl+D` (or `Cmd` on macOS) trigger add upstream/downstream.
- Announcements: success and error messages go to a webview `aria-live="assertive"` region and are mirrored with `showInformationMessage` / `showErrorMessage` so host-level screen readers also speak them.

## Error states and edge cases
- **Cycle detected (client)**: Block before calling CLI; message "Adding this link would create a cycle".
- **Cycle/duplicate (CLI)**: Show stderr, keep tree unchanged, and keep focus on the add control.
- **Missing/unknown id**: CLI returns NOT_FOUND -> message "Issue <id> not found" with a `Refresh` action.
- **Permission/lock**: Non-zero exit mentioning permissions or locks -> disable editing controls until next successful fetch.
- **Stale data**: If fetch is older than freshness threshold or CLI returns a stale hint, auto-refetch and display a banner.
- **Offline/CLI missing**: Hide editing controls; banner explains dependency editing is unavailable until `bd` is reachable.

## Loading and disabled states
- Show skeleton rows during the initial `bd deps` fetch.
- When the flag or version check fails, sections render read-only with a short explainer and a link to `docs/deps/dependency-ux.md`.
- During mutation, disable add/remove buttons for the active section and show a small spinner next to the header.
