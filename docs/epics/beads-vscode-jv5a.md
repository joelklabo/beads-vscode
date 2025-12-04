# Epic: Localization & i18n (beads-vscode-jv5a)

## Goals
- Externalize all user-facing strings with VS Code's `vscode.l10n` and `package.nls*` files.
- Ship ready-for-translation bundles (English default) without gating behind a feature flag.
- Add guardrails (lint/check scripts) to keep strings localized and safe.

## Scope & phases
1) **String audit & extraction**
   - Inventory strings across commands, tree items, status bar, activity feed, webviews, notifications, and tests.
   - Replace inline strings with `vscode.l10n.t` in source; move contribution titles/descriptions to `package.nls.json`.
   - Add `package.nls.en.json` (copy) to support default language and future locales.
2) **Webview localization**
   - Pass localized strings via webview state (no direct `vscode.l10n` inside webview scripts).
   - Provide a small `l10n.ts` helper for webview bundles to receive string tables + fallback values.
3) **Build outputs**
   - Generate `package.nls.{locale}.json` during build when locale packs exist (stub for now).
   - Ensure `vsce package` includes `package.nls*` and any webview string JSON shipped alongside media bundles.
4) **Validation & tests**
   - Add a lint rule/CI script to block new hardcoded English strings (except telemetry keys and log-only text).
   - Pseudo-localization smoke: run VS Code with `--locale qps-ploc` and ensure UI renders without truncation/overflows.
   - Unit tests: guard for missing keys (fallback to English), ensure `l10n.t` calls are covered for status bar + commands.
5) **Docs & contributor guidance**
   - Update README with “Adding strings” section and quickstart for translators.
   - Document the hygiene check (`node scripts/l10n-check.js`) and how to add new locales.

## Success criteria mapping
- **Externalized strings**: zero lint findings for hardcoded UI text; commands/views/tooltips come from `package.nls*.json` or `vscode.l10n.t`.
- **Bundles**: build emits `package.nls.json` + `package.nls.en.json`; webview strings packaged; no feature flag required.
- **Testing**: pseudo-loc runbook + unit tests for fallback/missing keys; CI l10n check wired.
- **Docs**: contributor instructions for adding/updating strings and running checks.

## Implementation notes
- Keep English copy minimal changes (only clarity tweaks). Avoid formatting tokens that break grammatical order; prefer `{0}` placeholders.
- For dynamic strings in code, prefer full-sentence localization calls rather than concatenation to reduce translator burden.
- Sanitize localized text before injecting into webviews/markdown tooltips (reuse existing sanitizers).
- Shared string tables should live under `src/strings/` with typed accessors to avoid key drift; tests should fail fast on missing keys.
- Ensure quick pick/notification titles remain short to avoid truncation in pseudo-loc.

## Risk & mitigations
- **Missing keys** → add runtime fallback to English + console warning; unit tests for required keys.
- **Layout breakage** → pseudo-loc + UI smoke checklist; keep tooltips concise.
- **Packaging gaps** → add VSCE packaging step in CI that asserts presence of `package.nls*.json` and webview string artifacts.

## Test checklist (manual + automated)
- Run pseudo-loc (`code --locale qps-ploc`) and open explorer, activity feed, status bar; verify no `???` placeholders.
- Verify command palette entries show localized titles/descriptions.
- Trigger common notifications (refresh success/failure, stale warning) and confirm localization.
- Webview: open feedback/little glen panes (if available) and verify strings rendered from passed tables.
- Run `node scripts/l10n-check.js` and the hardcoded-string lint to ensure clean pass.
