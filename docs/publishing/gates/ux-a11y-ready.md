# Gate: UX + accessibility ready

Date: 2025-12-17

This gate records the UX + accessibility readiness evaluation for a public Marketplace release.

## Evidence (automated)

- [x] Release checks pass: `npm run ci:verify`
  - Includes: unit tests, integration tests, webview CSP audit, and manifest validation.
- [x] Webviews render in headless Chromium: `npm run ci:visual:webviews` (artifacts under `tmp/webview-visual/`).
- [x] Accessibility behaviors and known limitations are documented: `docs/accessibility.md`.

## Manual checklist (pre-release)

Reference checklist: `docs/publishing/accessibility-release-checklist.md`.

- [ ] Keyboard-only navigation: explorer controls + webviews (focus visible, no traps).
- [ ] Screen reader pass (VoiceOver/NVDA/Narrator): meaningful labels + state announcements.
- [ ] Color contrast + theming: light/dark + forced-colors/high-contrast.
- [ ] Zoom: 100% and 200% (no clipped controls; readable labels).
- [ ] Error/validation messaging: actionable and announced (not color-only).

## Findings / known issues

- No release-blocking issues observed via automated checks.
- Known limitations (non-blocking): see `docs/accessibility.md#Known limitations`.

## Release decision

- Status: pending manual verification in VS Code before first public publish.

