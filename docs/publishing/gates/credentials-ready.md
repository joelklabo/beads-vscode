# Gate: Marketplace credentials ready

Date: 2025-12-17

This gate confirms the Marketplace (Visual Studio Marketplace) publishing credentials exist, are verified, and are stored correctly for CI publishing.

## Checklist

### Marketplace publisher

- [ ] Publisher exists for `package.json#publisher` (`klabo`) in Visual Studio Marketplace.
- [ ] Local `vsce` auth works (do **not** paste tokens in logs):
  - `npx vsce login klabo`
  - `npx vsce verify-pat klabo`

### Azure DevOps PAT

- [ ] Azure DevOps PAT created with publish permissions (see `docs/publishing/azure-devops-pat.md`).
- [ ] PAT verified against the publisher:
  - `npx vsce verify-pat klabo`

### GitHub Actions secret

- [ ] `VSCE_PAT` Actions secret exists in `joelklabo/beads-vscode`.
  - Verification command: `gh secret list -R joelklabo/beads-vscode --app actions --json name`

## Current status

- `VSCE_PAT` (repo Actions secret): **missing** (no Actions secrets configured as of 2025-12-17).

## Notes

- Once `VSCE_PAT` is set, publishing is triggered by pushing a matching tag (e.g., `v0.1.0`) and runs `.github/workflows/publish.yml`.

