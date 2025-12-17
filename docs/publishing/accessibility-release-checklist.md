# Accessibility release checklist (Marketplace)

This is a concrete pre-release checklist to run before publishing a new Marketplace version.

It complements the general a11y behaviors documented in `docs/accessibility.md`.

## Test setup

- Test at least:
  - Light theme + dark theme
  - High contrast / forced-colors mode (where available)
  - 100% and 200% zoom
- Test at least one screen reader:
  - macOS: VoiceOver
  - Windows: NVDA (or Narrator)
- Run a keyboard-only pass (no mouse).

## Core flows to test

### Explorer (tree views)
- Open Beady views from the Activity Bar and verify focus lands predictably.
- Navigate the issues list with arrow keys; verify selection is announced.
- Use Search and confirm results count/messages are readable and announced.
- Toggle “Closed hidden/visible” and confirm the explorer description updates and is announced.
- Open the filter picker and sort picker; verify titles/placeholders are meaningful and the selected item is announced.
- Expand/collapse an item row and verify expanded state is announced and focus remains visible.

### Issue detail + dependency editing
- Open an issue detail view and navigate the dependency tree with the keyboard.
- Verify dependency rows announce source/target/direction/type (not color-only).
- If dependency editing is enabled, verify “Add dependency” and “Remove dependency” affordances are reachable and labeled.
- Trigger an invalid action (cycle/duplicate) and confirm a warning message is announced and provides guidance.

### Dependency graph (webview)
- Open the dependency graph.
- Tab/arrow through nodes and edges; verify `aria-label` conveys id/title/status/direction/type.
- Enter/Space opens an issue when focused.
- Toggle linking/edit modes (if enabled) and confirm state is announced via a live region.
- Verify focus management when the graph rerenders (no focus loss or trap).

### Issues webview (if enabled)
- Open the Issues webview and confirm headings/landmarks exist and are navigable.
- Verify keyboard navigation across controls and that focus is visible.
- Ensure status, assignee, and badges are not conveyed by color alone.

### Error states
- With `bd` missing or misconfigured, verify the error message is clear, actionable, and announced.
- With invalid ids/unsafe input, verify inline validation + toasts are accessible.
