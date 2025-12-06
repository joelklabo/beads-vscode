# Issues view layout, header, and toggles (VS Code)

Context: beads-4yj (Issues list UX & assignee controls). This doc specifies the interaction and visual design for the VS Code Issues view so implementation tasks (beads-8mt, beads-bx7, beads-cyp, beads-o33, beads-bzb) share a consistent plan.

## Goals
- Make the Issues view scannable: show who owns work, status, and priority at a glance.
- Add a header/summary row per sort mode without breaking keyboard navigation.
- Provide an explicit hide/show closed toggle that coexists with quick filters and search.
- Remove the cycle-sort button while keeping discoverability of the explicit sort picker.

## Scope / non-goals
- VS Code surface only (not TUI/web).
- No data model changes; reuse existing bead fields.
- Keep existing quick filters, search, and manual ID sort semantics.

## Sort mode states (header + rows)
```
Header (one row, role=listitem, non-collapsible)
├─ ID mode: "Open · In‑Progress · Blocked · Closed" counts + total; description shows active filters.
├─ Status mode: same counts, plus stale warning badge when present.
├─ Epic mode: count of epics, children, and empty-epic warning count.
└─ Assignee mode: unique assignee count (incl. Unassigned) + total items; note when buckets are collapsed.

Row (taller, two-line layout)
Line 1: [status dot] ID · Title (ellipsis at ~60ch) · labels badges · priority chip (P1/P2/P3)
Line 2: [assignee dot + name] • status label • updated time • snippet (description/design/notes, sanitized)
```
- Empty states: header omitted when no items; tree shows existing empty-state text.
- Manual sort only applies in ID mode; other modes use deterministic grouping/sorting defined below.

## Assignee grouping decision
- Mode = Assignee renders collapsible sections per assignee + Unassigned bucket (see `docs/design/sort-assignee-grouping.md`).
- Inline assignee dot stays on each row for all modes to keep ownership visible outside Assignee mode.
- Collapse state persisted per assignee (sanitized key); default expanded. Empty buckets hidden.

## Hide/show closed toggle
- Toolbar button + command palette entry; keyboard: `Shift+Cmd/Ctrl+.` (proposal).
- State stored in `workspaceState` (boolean). Applied after quick filters/search so counts/snippets match visible set.
- Tree description appended with "· Closed hidden" when off.
- Context key exposed (e.g., `beady.closedVisibility=hidden|shown`) for menus/tests.
- When all visible items are closed and toggle is off, show empty state with hint to re-enable.

## Sort controls
- Remove cycle-sort toolbar button.
- Keep explicit picker command (`pickSortMode`, exposed in toolbar + command palette). Tooltip updated to "Choose sort mode".
- Persist last choice; default from setting `beady.sort.default` (fallback `id`).

## Accessibility
- Header row aria-label includes mode and counts (e.g., "Assignee mode, 5 assignees, 18 items").
- Assignee sections aria-label: "Assignee {name} — {count} items"; Unassigned labeled explicitly.
- Badge colors meet WCAG contrast; text labels accompany dots (no color-only cues).
- Focus order: header → sections → rows; header is not collapsible and should not trap focus.
- Status/assignee text uses sanitized strings; tooltips generated via existing tooltip sanitizer.

## Security
- Sanitize all user-supplied strings (title, assignee, labels, snippets) before HTML; escape in webview and TreeItem descriptions/tooltips.
- Persist collapse keys using normalized/hashed names to avoid storing raw user input.
- No remote images or injected HTML in header/rows.

## Risks & constraints
- VS Code TreeView height: header + taller rows can reduce visible items. Fallback: truncate snippets at ~80 chars; hide second line on very small viewports (<5 rows) while keeping status/assignee on line 1.
- Performance: large assignee buckets could slow render; mitigate with memoized grouping and skipping empty buckets.
- Discoverability: removing cycle-sort relies on picker; add short info toast on first change and keep command palette entry.

## Interaction checklist by task
- beads-8mt (assignee sections): use bucket rendering + persisted collapse; keep inline assignee dots.
- beads-bx7 (edit assignee): reuse sanitized assignee display and update collapse keys when name changes.
- beads-cyp (closed toggle): implement toolbar/command/context key/persistence pipeline described above.
- beads-o33 (header & rows): add header row per mode with counts; implement two-line row layout and snippet truncation rules.
- beads-bzb (icons): align status dots/icons used in both header badges and row status.
```
