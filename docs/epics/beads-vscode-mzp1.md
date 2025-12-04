# Epic: Inline Bead Editing in Explorer (beads-vscode-mzp1)

## Goal
Allow quick inline edits of bead title, status, and labels directly in the explorer/activity views with full keyboard + accessibility support and safe bd CLI writes.

## Scope
- Inline edit fields: **title**, **status (quick pick)**, **labels (add/remove chips + quick pick)**.
- Surfaces: main explorer tree and activity feed items (same component where possible).
- Feature flag: `beads.inlineEditing.enabled` (default off for rollout).

## UX flows
- **Entry**: keyboard `F2` or context menu “Rename / Edit title”; status/labels via context menu or inline action icons.
- **Title edit**: transforms label into input with current text selected; Enter saves, Esc cancels. Max length enforced (e.g., 140 chars). Shows spinner while saving; on error reverts and shows message.
- **Status quick pick**: opens allowed statuses (respect transitions/validation helper). Multi-select off. Shows per-item error if blocked transition.
- **Labels**: inline chips with `+` button opening quick pick (multi-select). Remove via `x` on chip or Delete when focused. Keyboard supports Tab/Shift+Tab to navigate chips.
- **Announcements**: screen reader text for enter/exit edit, success/failure, and validation errors. Tooltips show shortcuts.

## Validation & rules
- Title: trimmed, non-empty, enforce length; normalize whitespace; no change → no write.
- Status: allowed transitions validated client-side (reuse existing helper); blocked/self transitions rejected with explanation.
- Labels: dedupe, case-normalized list; add/remove minimal diff against current labels.
- All edits run through bd CLI (`bd update` / `bd label add/remove`) with existing worktree guard; offline/timeout handling follows resilience policy.

## Data + caching
- Reuse loaded bead list; optimistic update applied to tree item on success. On failure, revert and surface error.
- After successful edit, trigger refresh of affected bead(s) only; avoid full tree refresh where possible.

## Accessibility
- Full keyboard reachability: start edit via F2/Enter, navigate chips, close with Esc.
- `aria-live` polite messages for success/error; labels on chips: “Label: <name>. Press Delete to remove.”
- High-contrast: focus outline, muted error badge; no color-only indicators.

## Error handling
- Inline error bar under the edited row; also surfaces notification with Retry/Copy command.
- Partial failure for labels (batch) displays per-label result.

## Testing checklist
- Keyboard-only: start edit, commit/cancel, add/remove labels, change status.
- Validation: empty title blocked; over-length title rejected; invalid status transition blocked.
- Offline/slow: edit shows retry path; cache remains unchanged on failure.
- Screen reader: announces entry/exit and success; chip remove announces label name.
- Feature flag off: no inline edit affordances in UI.

## Implementation slices
1) **Feature flag + enablement**: surface inline controls only when enabled and workspace has beads.
2) **Title editor component**: shared between tree and activity items; manages focus, cancel, submit, and revert.
3) **Status quick pick command**: reuses validation helper; per-item error handling; refresh targeted bead.
4) **Label chip editor**: render chips + add/remove actions; batch bd calls with diffing; error reporting per label.
5) **A11y + localization**: all strings via `vscode.l10n`, aria labels set; focus outlines consistent with theme.
6) **Tests**: unit for diff/validation; integration for keyboard flows (later testing task).
