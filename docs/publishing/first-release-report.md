# First Marketplace release report

Date: 2025-12-17

## Target

- Extension id: `klabo.beady`
- Version: `0.1.0`
- Intended tag: `v0.1.0` (must match `package.json#version`)

## Publish attempt (local)

Command:

- `npx vsce publish --azure-credential --follow-symlinks`

Result:

- CLI reported success, but the extension is not visible via the public Marketplace endpoints yet.

## Verification

- Marketplace page:
  - `https://marketplace.visualstudio.com/items?itemName=klabo.beady`
  - Result: HTTP 404 as of 2025-12-17.
- Public gallery query:
  - `npx vsce show klabo.beady`
  - Result: not found.
- VS Code install:
  - VS Code `1.107.1` CLI: `code --install-extension klabo.beady`
  - Result: not found.

## Notes / follow-ups

- Ensure the Marketplace publisher exists and the release automation credential is configured:
  - See `docs/publishing/gates/credentials-ready.md`.
- Recommended publish path: push `v0.1.0` to trigger `.github/workflows/publish.yml` once `VSCE_PAT` is configured.

