# Stale / Warning bucket rules

This view surfaces work that needs attention without mixing in closed items.

- **Scope**: only open/in_progress/blocked items are candidates. Closed issues (including epics) never appear in the Stale/Warning bucket.
- **Stale detection**: a task is stale when `status === "in_progress"` **and** `inProgressSince` is older than the configured threshold (`beads.staleThresholdMinutes`, default 10 minutes). We convert minutes → hours and compare to `Date.now()`.
- **Epics**: empty epics are highlighted in Warning **only if they are not closed**. Closed empty epics live in the Closed section instead of Warning.
- **Blocked items**: blocked work is *not* considered stale unless it is also `in_progress`; blocked-but-not-in-progress items remain in the Blocked bucket, not Warning.
- **Displayed contents**:
  - Stale tasks (in progress beyond threshold)
  - Empty non-closed epics
- **Placement**: the Warning bucket is shown above other sections in both Status and Epic sort modes.
- **Time zones**: all comparisons use ISO timestamps from bd export; calculations rely on the local clock. Updated-at is not used for staleness today; only `inProgressSince` drives the timer.

Developers: keep these rules mirrored between status and epic views whenever staleness logic changes.
