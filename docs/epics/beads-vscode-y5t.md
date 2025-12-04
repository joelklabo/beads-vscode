# Epic: Creative Epic/Task Hierarchy with Folder-Style Display (beads-vscode-y5t)

## Goal
Present epics as true parent folders in the Beads VS Code explorer with distinctive icons and collapse/expand behavior, while preserving search/filter and status coloring.

## Current state
- Epic tree already renders epics as expandable parents (status color + folder icons) and ungrouped bucket.
- Icons: epic=rocket, task=tasklist, bug=bug, feature=sparkle, chore=wrench, spike=telescope.
- Collapsed state persists via workspace state; activity feed unaffected.

## Gaps to close
- Integration tests exist (beads-vscode-4yp) but hovers/tooltips for child items could also show parent context.
- No creative icon for feature zap vs sparkle choice; could add variant and theme override.
- Ungrouped section currently generic; could add subtle badge.

## Proposed slices
1) UX polish
- Add parent-epic breadcrumb in child tooltip (`Parent: <epic-id>` with quick open command).
- Minor spacing/indent tweaks for nested tree items to mirror VS Code folders.

2) Icon variants / themes
- Allow icon override via settings map: `beads.iconMap.issueType.{epic,task,feature,spike,chore,bug}` defaulting to current icons.
- Respect status color tint while keeping icon shapes distinct.

3) Perf/robustness
- Cache parent lookups in provider to avoid recompute each refresh.
- Guard against missing parentId gracefully.

## Acceptance alignment
- Epics expandable/collapsible: already in place.
- Unique icons per type: already, but add setting hook for future flexibility.
- Search/filter: ensure parent tooltip info doesn’t affect filters.

## Next steps
- [ ] Add parent breadcrumb in BeadTreeItem tooltip when parentId present.
- [ ] Add optional icon map setting and wire into BeadTreeItem construction.
- [ ] Small indent tweak for epic child rendering if needed (match VS Code folder tree padding).
