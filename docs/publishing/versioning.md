# Versioning & Releases

This repo publishes a VS Code extension. Releases are tied to the extension manifest version (`package.json#version`) and a git tag.

## Version policy

- Use **Semantic Versioning** (`MAJOR.MINOR.PATCH`).
- The git tag **must** match the manifest version:
  - `package.json#version: 0.1.1`
  - git tag: `v0.1.1`

## Release checklist (local)

Before publishing, ensure:

1. `package.json#version` is bumped appropriately.
2. `CHANGELOG.md` is updated (add an entry for the version being published).
3. All release gates pass:
   - `npm run ci:verify`
4. The packaged VSIX looks correct:
   - `npm run package` (produces a `.vsix` in the repo root)

## Publishing

There are two supported publishing paths:

### 1) CI publish (recommended)

Once `.github/workflows/publish.yml` exists, publishing should be tag-driven:

1. Push `main`.
2. Create and push a tag:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
3. GitHub Actions runs release gates and publishes using the `VSCE_PAT` secret.

### 2) Local publish (fallback)

If CI publish is not available, you can publish from a maintainer machine:

1. Ensure `vsce` is authenticated for the publisher:
   - `vsce login <publisher>`
2. Publish:
   - `npm run publish`

## Pre-releases

If you need a pre-release channel:

- Use a SemVer pre-release version (example: `0.2.0-rc.1`) and tag `v0.2.0-rc.1`.
- Publish with:
  - `vsce publish --pre-release --follow-symlinks`

## Recovery / edge cases

### Version collision (Marketplace already has the version)

If publishing fails because the version is already published:

1. Bump `package.json#version` to a new patch version.
2. Update `CHANGELOG.md`.
3. Re-run `npm run ci:verify`.
4. Publish again with a new tag.

### Tag already exists

If a tag exists but you need to republish:

Preferred approach is **fix-forward**:

1. Do not rewrite tags.
2. Bump the patch version and publish a new tag.
