# Sort picker and assignee grouping design

## Goals
- Replace the blind cycle sort control with an explicit, stateful picker so users always know the active sort mode.
- Add an assignee-grouped view that makes ownership scanning fast, including an Unassigned bucket.
- Keep behavior consistent with existing filters/search, manual sort, and persisted collapse state.

## Non-goals
- Changing the data model or bd CLI; we reuse existing bead fields.
- Touching web/TUI renderers (VS Code surface only).
- Introducing new status values or priority/grouping dimensions.

## Constraints and assumptions
- Workspace state persists under `beady.*` keys; migrations must be backward-safe.
- Manual sort order stays intact across mode switches and remains the only re-ordering applied in ID mode.
- Feature must honor worktree guard and existing command contexts; no new permissions.
- Default sort mode remains configurable; picker is enabled by default but can be disabled via setting.

## Interaction design
- Command: keep `beady.toggleSortMode` id but present a Quick Pick titled **"Choose sort mode"** instead of cycling.
- Options (ordered): ID (natural), Status, Epic, Assignee. The current mode is preselected; description shows how items will be grouped/sorted.
- Acceptance: selecting an option updates the tree immediately, persists to `workspaceState`, updates status/description/tooltip, and sets a context key (e.g., `beady.activeSortMode`).
- Cancellation: Escape or closing the picker makes no changes and does not emit stale info messages.
- Messaging: on change, show a concise info toast (e.g., "Sort mode: Assignee") but suppress on cancel.
- Default: picker opens with the last mode; if none saved, use setting `beady.sort.default` (fallback `id`).

## Assignee grouping behavior
- When mode = Assignee, the root renders collapsible sections per assignee plus an **Unassigned** bucket.
- Group key: normalized assignee name from `deriveAssigneeName(item, "Unassigned")`, trimmed and lowercased for grouping; display uses sanitized/original casing with truncation + ellipsis at ~24 chars.
- Ordering: alphabetical (case-insensitive) by display name; Unassigned always last.
- Items inside each section use natural ID sort; manual sort is ignored in this view.
- Collapse state: persisted per bucket using sanitized keys; default expanded for all buckets; respects existing collapsed sections for other modes.
- Stale warning: keep a Warning section (stale in-progress + empty epics) above buckets, not duplicated inside buckets.
- Filters/search: apply quick filters/search before grouping; empty buckets are omitted.

## Persistence and migration
- Reuse `beady.sortMode` for the selected mode; on first run, migrate legacy values (`id|status|epic|assignee`) verbatim.
- Add optional setting `beady.sort.default` (string enum) and `beady.sort.pickerEnabled` (boolean, default true) to gate rollout.
- Collapsed sections: maintain existing `beady.collapsedSections`; for assignee buckets, store sanitized keys under a new map (e.g., `beady.collapsedAssignees`) to avoid leaking raw names.
- Manual sort: no migration; retained and only applied when mode=ID.

## Accessibility requirements
- Quick Pick: title/placeholder include current mode; items have clear labels and short descriptions; fully keyboard navigable.
- Announce active mode: tree description and context key feed toolbar/menu "when" clauses so screen readers have consistent text.
- Assignee sections: aria-label should include assignee name and item count (e.g., "Assignee Ada — 3 items"); Unassigned labeled explicitly.
- Avoid color-only cues: section icons use VS Code theme colors with text; emoji dots remain but not as the sole indicator.
- High contrast: honor theme colors and visible focus rings for sections and picker selection.

## Sanitization rules
- All assignee strings pass through existing tooltip/text sanitizers before rendering or persisting keys.
- Collapse-state keys should use a hashed/normalized form to avoid storing raw user input.
- Truncate overly long names in UI but keep full sanitized value in aria-label.

## Edge cases
- Multiple casing variants of the same name should merge into one bucket.
- Empty list: picker still opens; tree shows empty state without errors.
- Large assignee counts: rendering should remain performant; consider auto-collapsing buckets if >30 assignees (future opt).
- Invalid/undefined assignee fields fall back to Unassigned bucket.

## Rollout plan
1) Land settings + migration plumbing (no UI change when picker disabled).
2) Ship picker + context/description updates.
3) Ship assignee grouping sections + collapse persistence.
4) Add tests (picker flows, grouping, sanitization) and docs.
5) Enable by default; allow disabling via `beady.sort.pickerEnabled` if issues arise.
