# Bulk actions rollout

- **Flag**: `beady.bulkActions.enabled` (default: `false`). Enables bulk status and label actions in the Beads explorer and activity feed.
- **Limit**: `beady.bulkActions.maxSelection` caps how many items a single bulk action can touch (default: `50`, valid range `1-200`). Values outside the range are rejected and the default is used instead.
- **How to enable**: Set the flag to `true` and keep `maxSelection` within the valid range. Reload the VS Code window if commands or menus were previously hidden.
- **Rollback**: Set `beady.bulkActions.enabled` back to `false` to hide bulk commands and menus; no data migration required.
- **Scope**: Only affects bulk status/label commands. Other features remain unchanged.
- **Guidance**: Choose a conservative `maxSelection` to avoid long-running CLI batches. Increase gradually once the workspace performance is validated.
