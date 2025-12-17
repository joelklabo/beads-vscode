# CI Publishing (VS Code Marketplace)

This repo is set up to publish to the VS Code Marketplace from GitHub Actions on a git tag push.

## Trigger

The publish workflow runs on tag pushes matching `v*`:

- `v0.1.1`
- `v1.0.0`
- `v0.2.0-rc.1` (treated as a pre-release)

## Required secrets

The workflow expects the following GitHub Actions secret to exist:

- `VSCE_PAT` — Azure DevOps Personal Access Token with Marketplace publish scope (do not paste tokens into docs).

## What the workflow does

`.github/workflows/publish.yml` performs:

1. `npm ci`
2. Validates the tag matches `package.json#version` (`vX.Y.Z` ↔ `X.Y.Z`).
3. Runs release gates (`npm run ci:verify`).
4. Builds a VSIX (`npm run package`) and uploads it as a workflow artifact.
5. Publishes via `npm run publish` using `VSCE_PAT`.
   - If the tag contains a hyphen (example: `v0.2.0-rc.1`), it publishes with `--pre-release`.

## Manual publish (fallback)

If CI publishing is unavailable, a maintainer can publish locally:

1. `npm run ci:verify`
2. `vsce login <publisher>`
3. `npm run publish`
