# Publishing to Open VSX (VSCodium)

Open VSX is an alternative extension registry consumed by VSCodium and other VS Code distributions that do not use the Microsoft Marketplace.

## Prerequisites

- An Open VSX account and accepted publisher agreement.
- A claimed namespace matching `package.json#publisher` (`klabo`).
- An Open VSX access token (PAT).

## One-time setup

1. Create/claim the namespace (typically the same as `package.json#publisher`).
2. Create an access token.
3. Store it as a GitHub Actions secret:
   - Name: `OVSX_TOKEN`
   - Scope: repo Actions secret for `joelklabo/beads-vscode`

## Publish locally (optional)

- Package: `npm run package`
- Publish:
  - `npx ovsx -p <token> publish *.vsix`

If publishing a pre-release version (SemVer with `-`), add `--pre-release`.

## CI publishing

Workflow: `.github/workflows/publish-openvsx.yml`

- Triggers on pushed tags matching `v*` (same tag scheme as Marketplace publishing).
- Validates tag matches `package.json#version`.
- Runs release gates (`npm run ci:verify`) and packages the VSIX.
- Publishes using `OVSX_TOKEN`.

