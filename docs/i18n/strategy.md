# Localization Hygiene

We treat localized strings as untrusted input. To keep UI text safe and leak‑free:

- **No secrets or paths** in `package.nls*.json`. Avoid examples that include real file system paths, tokens, or repo internals.
- **Sanitize everything** rendered in webviews and tooltips. Localized strings pass through the same sanitizers used for English.
- **Automated checks**: `node scripts/l10n-check.js` runs in CI to block token/path patterns inside localization bundles.
- **Review guidance**: When adding strings, prefer neutral examples ("/path/to/file" over a real path) and avoid copying environment variables or auth headers into user-facing text.

Run the hygiene check locally with:

```bash
node scripts/l10n-check.js
```
