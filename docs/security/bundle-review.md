# Bundle review

Run `npm run audit:bundle` before packaging or publishing. The command rebuilds the extension (`npm run bundle`) and validates the emitted esbuild metafile at `dist/extension.meta.json`.

The audit checks:
- **Unexpected externals:** Only Node built-ins plus `vscode` and `@vscode/test-electron` may remain external at runtime. Adjust the allowlist in `scripts/audit-bundle.js` if you intentionally depend on another runtime module.
- **Dynamic imports/requires:** Fails if new dynamic imports appear. `./extension.main` is explicitly allowlisted because the entry shim purges the module cache during tests.
- **Eval/new Function:** Any `eval()` or `new Function()` usage that does not match the allowlisted `SortTemplate` snippet from `source-map-js` will fail the audit. Review new matches for safety and licenses before expanding the allowlist.
- **Bundle size:** Default budget is 1.5 MB (override with `BUNDLE_MAX_BYTES=<bytes>`). Exceeding the budget fails the audit.

Review unexpected externals and size regressions to confirm licenses and attack surface before publishing. Update allowlists sparingly and document the rationale in code review notes.
