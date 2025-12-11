# Changelog

## Unreleased

### Issues View UX Improvements (epic beads-4yj)

- **Hide/Show Closed Toggle**: New toolbar button (`Beady: Toggle Closed Items`) lets you hide or show closed issues. State persists across sessions and works with search and quick filters.
- **Assignee Edit**: Edit assignees directly from the Issues list context menu or detail panel. Input is validated/sanitized to prevent injection attacks.
- **Cycle-Sort Button Removed**: The toolbar cycle-sort button has been removed. Use the explicit sort picker (`Beady: Choose Sort Mode`) instead. The `beady.sortPicker.enabled` setting is now deprecated as the sort picker is always enabled.
- **Assignee/Status Badges**: Every row displays an assignee pill and colored status badge, even when collapsed.
- **Expandable Rows**: Press Space/Enter or click the chevron to expand a row and see labels, priority, external reference, and last update without leaving the list.
- **Accessible Sort Picker**: The sort picker now includes all four modes (ID, Status, Epic, Assignee) in a single quick pick menu.

### Other Changes

- Add size guard script (`npm run check:size`) to flag files over 320 lines in src/.
- Prepublish now gates VSIX builds on bundle audit, size, and perf budgets; emits VSIX size JSON artifact for CI.
- Document modularization rollout/rollback steps and PR rebasing guidance.
- `npm run install-local` now installs the built VSIX and triggers a VS Code reload automatically (opt out with `NO_RELOAD_AFTER_INSTALL_LOCAL`); docs added for the flow.
- Documented the dependency tree editing preview (enable with `beady.enableDependencyEditing`): upstream/downstream tree view actions, bd `--no-daemon` usage, a11y focus/labels, and safe cycle/duplicate guards.
- Documented clearer filter selection (toolbar chip + command palette), always-on assignee/status badges, and expandable rows in README/QUICKSTART; includes keyboard/high-contrast notes and HTML-escaping of user strings.
- Added rollout flag `beady.sortPicker.enabled` (default on) to enable/disable the new sort picker and assignee grouping; picker shows in the toolbar and command palette only when enabled.
- Renamed all VS Code command/view/context IDs to the `beady.*` prefix (was `beads.*`) to avoid collisions with similarly named extensions; settings keys now use the `beady` namespace.
- Legacy `beads.*` command IDs/keybindings are no longer registered; update custom bindings to the new `beady.*` names.
