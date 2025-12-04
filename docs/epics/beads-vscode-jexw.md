# Epic: Export beads to Markdown/CSV (beads-vscode-jexw)

## Goal
Provide one-click export of beads (selection or current filters) to Markdown and CSV with safe defaults, localization-ready headers, and clear UX.

## Scope
- Commands: `Beads: Export to Markdown`, `Beads: Export to CSV` (command palette + explorer toolbar, feature-flagged `beads.export.enabled`, default off for rollout).
- Sources: current tree dataset after filters/search/sort OR explicit multi-selection; fallback to all beads when nothing selected and no filters.
- Outputs: Markdown table and CSV file on disk; no uploads.

## UX flow
1) User triggers command → quick pick to choose scope (Selected / Current view / All). If selection exists, default to Selected.
2) Show save dialog with sane defaults (`beads-export.md` / `.csv`) in workspace root; remember last directory.
3) While exporting, show cancellable progress notification; on success, toast with “Open file” button; on failure, show error with “Copy details”.
4) If dataset empty, show message “Nothing to export for the current filter/selection.”

## Data + formatting
- Columns (default): `ID`, `Title`, `Status`, `Assignee`, `Labels`, `Updated`, `Blockers`, `Dependencies`, `External Ref`. Optional columns settable later; for now, use fixed set.
- Markdown: GitHub-flavored table, escape pipes/backticks, wrap multi-values with commas; include generated timestamp + filter description in a header block.
- CSV: UTF-8, configurable delimiter (default comma), quotes around fields with delimiters/newlines/quotes; escape quotes by doubling; optional BOM setting off by default.
- Localization: column headers and fixed text through `vscode.l10n`; date/time formatted using locale.
- Redaction: never include descriptions/notes; trim whitespace; limit title length to avoid unwieldy tables (ellipsize at ~120 chars in Markdown display, keep full value in CSV).

## Safety & validation
- Validate write path; block overwriting non-file targets; warn on existing file with “Replace?” confirmation.
- Enforce max row count? Not initially—stream rows to reduce memory; still show progress for large (>2k) items.
- Error handling: partial write surfaces error and deletes partial file; copyable diagnostics include row count and path.

## Performance
- Build rows from in-memory bead list (already loaded) with no extra bd calls.
- Streaming writer for CSV (line-by-line) to keep memory low; Markdown can be buffered in memory (typical size small).
- Target: <500ms for 500 rows; progress notification with spinner for visibility.

## Testing checklist
- Export with selection vs filtered view; empty result shows friendly message.
- Markdown escaping: pipes/backticks, commas, quotes, and newlines render correctly; headers localized.
- CSV escaping & delimiter variations (`",";"\t`); verify UTF-8 output; BOM toggle honored.
- Overwrite prompt shown when file exists; cancel leaves file unchanged.
- Large list (mock 2k rows) completes without memory spike and respects progress.
- Accessibility: commands keyboard-invokable; progress/notifications readable by screen readers.

## Implementation slices
1) Command wiring + feature flag; scope resolver (selection vs filtered vs all).
2) Shared export model: normalize bead data and column set; helper to describe filter context in header/metadata.
3) Markdown writer; CSV writer with streaming + delimiter/BOM options.
4) Save-dialog + overwrite confirmation + error handling.
5) Tests + docs: unit tests for formatting/escaping; README section and troubleshooting.
