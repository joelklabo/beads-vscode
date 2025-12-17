# Azure DevOps PAT for `vsce` (VS Code Marketplace)

Publishing to the VS Code Marketplace via `vsce` requires an **Azure DevOps Personal Access Token (PAT)** with Marketplace publish permissions.

This repo expects the token to be stored as a GitHub Actions secret named `VSCE_PAT`.

## Create the PAT

1. Sign in to Azure DevOps (the same account that owns the Marketplace publisher).
2. Ensure you have an Azure DevOps organization available (create one if needed).
3. Create a Personal Access Token:
   - From Azure DevOps: **User settings → Personal access tokens**
4. Configure the token:
   - **Organization:** choose **All accessible organizations** (important)
   - **Scopes:** enable **Marketplace → Manage**
   - **Expiration:** choose an expiration policy that matches your release cadence (shorter is safer; document rotation)
5. Copy the token value immediately (you won’t be able to view it again).

## Store as a GitHub Actions secret

Store the PAT as a repository secret:

- Name: `VSCE_PAT`
- Value: *(the Azure DevOps PAT)*

The publish workflow references this secret by name and does not hardcode any credentials.

## Local usage

To publish from a maintainer machine (fallback to CI):

```bash
export VSCE_PAT="...redacted..."
npm run ci:verify
npm run publish
```

## CI usage

GitHub Actions uses:

- `secrets.VSCE_PAT` → `VSCE_PAT` environment variable

## Troubleshooting

- **Auth failures / 401 / 403:** confirm the PAT includes **Marketplace (Manage)** scope.
- **Publisher not found:** ensure the publisher id exists in the Marketplace and you are using the correct `package.json#publisher`.
- **Token works locally but not in CI:** confirm the GitHub secret is set on the correct repo and environment.
- **Intermittent failures:** check PAT expiration and rotate if needed.

## Rotation procedure

1. Create a new PAT (same scope + All accessible organizations).
2. Update the GitHub Actions secret `VSCE_PAT`.
3. Revoke the old PAT in Azure DevOps.
