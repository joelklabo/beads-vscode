# Marketplace Publishing Plan (Beady)

## Goals

- Publish Beady to the **VS Code Extension Marketplace** so it is installable from VS Code.
- Make releases **repeatable and low-risk** (CI gates + tag-based publish).
- Keep future updates easy: bump version → tag → CI publishes.

## Target registries

1. **VS Code Marketplace (Visual Studio Marketplace)** — primary target.
2. **Open VSX (optional)** — useful for VSCodium and other non-Microsoft distributions.

## Extension identity

- Extension id: `${publisher}.${name}`
- Current manifest values:
  - `publisher`: `klabo`
  - `name`: `beady`
  - Extension id: `klabo.beady`

If Marketplace conflicts force changes:
- If `publisher` is unavailable: change `package.json#publisher` and update all Marketplace links.
- If `name` is unavailable: change `package.json#name` (the Marketplace requires global uniqueness).

## Versioning + tags

- Use **SemVer** for `package.json#version`.
- Release tags: `vX.Y.Z` (example: `v0.1.1`), and the tag version **must match** `package.json#version`.
- Pre-releases (optional): use `vsce publish --pre-release` and a tag convention (example: `v0.2.0-rc.1`).

## CI publishing trigger (GitHub Actions)

- Trigger publishing on **git tag push** matching `v*`.
- Workflow requirements:
  - `npm ci`
  - Run release gates (lint/tests/bundle audit/VSIX size/VSIX contents)
  - `vsce publish --follow-symlinks`

## Credentials + secrets

### VS Code Marketplace

- `vsce` publishes using an **Azure DevOps Personal Access Token (PAT)**.
- Required secret:
  - `VSCE_PAT` (GitHub Actions secret)

### Open VSX (optional)

- Required secret:
  - `OVSX_TOKEN` (GitHub Actions secret)

## Release gates (must stay green)

- `npm run ci:verify` (lint + unit/integration tests + audit + perf/manifest checks)
- VSIX size budget check (`scripts/check-vsix-size.js`)
- VSIX contents audit (denylist secrets/dev artifacts)

## Rollback / incident response

Preferred:
- Publish a **new patch version** quickly (fix-forward), since users update automatically.

If necessary:
- Use `vsce unpublish <publisher>.<name>` to remove an extension from the Marketplace.
  - Only for severe incidents (leaked secrets, malware, etc.).
  - Requires `VSCE_PAT` and should be followed by a postmortem + credential rotation if applicable.

## Common pitfalls (and mitigations)

- **PAT created for a single org** instead of *All accessible organizations* → publishing fails.
  - Mitigation: follow the PAT checklist exactly (Marketplace: Manage scope, all orgs).
- **Wrong PAT scope** (missing Marketplace: Manage) → publishing fails.
  - Mitigation: use *Marketplace (Manage)* scope.
- **Extension name conflict** (Marketplace error: extension name already exists).
  - Mitigation: rename `package.json#name` and update docs/links before first publish.
- **Publisher id conflict** (publisher id already claimed).
  - Mitigation: pick a new publisher id, update `package.json#publisher`, and re-verify `vsce login`.
- **Broken Marketplace README links** because files are excluded from the VSIX.
  - Mitigation: use absolute GitHub URLs for maintainer docs (AGENTS/CONTRIBUTING/etc.).
- **Badges not shown / blocked** due to Marketplace badge allowlist.
  - Mitigation: only use approved badge sources (or remove badges).
- **Missing icon/screenshot** due to incorrect paths or `.vscodeignore`.
  - Mitigation: put assets under `media/` and confirm they’re present in the packaged VSIX.

