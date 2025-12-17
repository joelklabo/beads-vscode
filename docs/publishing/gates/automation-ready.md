# Gate: Publishing automation ready

Date: 2025-12-17

This gate confirms that automated Marketplace publishing is wired up and includes release safeguards.

## Workflow checks

- [x] `.github/workflows/publish.yml` exists.
- [x] Workflow triggers on tag pushes matching `v*`.
- [x] Workflow validates `GITHUB_REF_NAME` matches `package.json#version` (`vX.Y.Z` ↔ `X.Y.Z`).
- [x] Workflow runs release gates before publishing:
  - `npm run ci:verify` (tests + bundle audit + VSIX size + VSIX contents audit)
- [x] Publishing uses `VSCE_PAT` via GitHub Actions secrets (`secrets.VSCE_PAT`) and does not hardcode credentials.
- [x] Concurrency is configured to avoid double-publishing the same tag.
- [x] VSIX is uploaded as a workflow artifact for debugging/audit.

## Notes

- Local release gate dry-run: `npm run ci:verify` passes on `main`.
- Actual publish requires `VSCE_PAT` to be configured as a GitHub Actions secret (see `docs/publishing/azure-devops-pat.md`).
