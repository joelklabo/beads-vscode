# Stale / Warning bucket rules

The Warning bucket surfaces items that need attention without ever mixing in closed work.

## What shows up
- **Stale tasks**: `status === "in_progress"` and `inProgressSince` is older than `beads.staleThresholdMinutes` (default 10 minutes; converted to hours internally).
- **Empty epics**: epics with no children that are not closed. They appear so owners can either add work or close them.
- **Placement**: the Warning bucket sits above other sections in both Status and Epic sort modes.

## What never shows up
- **Closed items** (tasks or epics), even if they still have an old `inProgressSince` timestamp.
- **Blocked/Open tasks** that are not currently `in_progress`; they remain in the Blocked/Open buckets.
- **Epics with children** (unless they are empty); populated epics stay in their normal sections.

## Examples
| Item | Status | Children | inProgressSince vs threshold | Bucket |
| --- | --- | --- | --- | --- |
| Task A | in_progress | - | 30 minutes ago / 10 minute threshold | Warning (stale task) |
| Task B | in_progress | - | 5 minutes ago / 10 minute threshold | In Progress (not stale) |
| Task C | blocked | - | n/a | Blocked |
| Task D | closed | - | Old timestamp present | Closed (never Warning) |
| Epic E | open | none | n/a | Warning (empty, not closed) |
| Epic F | closed | none | n/a | Closed |
| Epic G | open | has children | n/a | Epic/Status section |

## Notes
- Staleness uses ISO timestamps from the bd export and the local clock for comparisons.
- The same rules apply in both Status and Epic view modes; keep them in sync when updating logic.
- When changing copy that references the Warning bucket, remember closed items are intentionally excluded.
