# Filters, assignee badges, and expandable rows

Design contract for clearer filter selection, consistent assignee display, and an expandable row affordance across list views.

## Usage quick hits
- Toolbar chip always reads `Filter: <mode>`; click or run `Beads: Switch Filter Mode…` to change scopes. The active label is visible even in high-contrast themes.
- Cycle sort until **assignee** to group by owner; names sort case-insensitively with **Unassigned** pinned to the bottom.
- Every row shows assignee + status pills (collapsed and expanded). Press Space/Enter or click the chevron to toggle details; focus and `aria-expanded` stay in sync.
- See also the overview in [README](../README.md#filters-and-badges) and [QUICKSTART](../QUICKSTART.md#filter--sort), and release notes in [CHANGELOG](../CHANGELOG.md#unreleased).

## Filter surface
- **Toolbar chips** (primary): one chip per mode with `aria-pressed` state. Label pattern `Filter: <mode>` (Issues, Epics, Favorites, Recent, Blockers, etc.). Tooltip summarizes scope (e.g., "Issues only" vs "Epics + children").
- **Command palette mirror**: `Beads: Switch Filter Mode…` opens a quick pick grouped by category (Issues / Epics / Favorites / Other). Each entry shows the same scope hint and whether it affects children.
- **Scope clarity**: all filter copy differentiates issue-level vs epic-level vs mixed scopes. When a mode hides epics (or tasks), the empty states say why.
- **Persistence**: selection is stored per workspace; reopening restores the last mode.

## Assignee badges
- **Format**: text pill `• Name` where the dot color mirrors status color (open=blue, in_progress=yellow/orange if stale, blocked=red, closed=green). Tooltip reveals the full, unsliced name.
- **Truncation**: names longer than ~18 chars are truncated with ellipsis; original preserved in tooltip.
- **Sorting**: case-insensitive by display name; `Unassigned` always sorts last. Secondary sort by bead id to keep order stable.
- **Fallbacks**: empty/whitespace names render as `Unassigned` with a neutral (white) dot.
- **Sanitization**: names are HTML-escaped before rendering to avoid script/markup injection.

## Expand / collapse rows
- **Affordance**: chevron button on each row (`aria-expanded`) toggles a detail panel; keyboard: Space/Enter toggles, Left collapses, Right expands. Focus order: toolbar → list row → chevron → detail content.
- **Detail contents**: labels/tags, status + updated-at, external reference, snippet preview, blockers count, assignee tooltip. No destructive actions inside the panel.
- **Density**: collapsed rows remain one line; expanded panel uses subtle background and aligns text to the grid without shifting sibling rows.

## Accessibility & security
- All controls are keyboard reachable; chips are `button[aria-pressed]`; rows/treeitems carry `aria-level` and `aria-expanded` where applicable.
- High-contrast: badges use text + dot (not color-only); chevrons have focus outlines and 3:1 contrast minimum.
- Screen readers announce current filter in the toolbar, and expanded detail reads its heading plus a summary of fields.
- All user strings (assignee, labels, external refs) are sanitized/escaped before injection into tooltips or markdown.
