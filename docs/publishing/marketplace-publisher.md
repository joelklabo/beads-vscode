# VS Code Marketplace publisher

The Marketplace publisher is the identity that owns the extension listing. The published extension id is:

`<publisher>.<name>` → currently `klabo.beady`

## Create the publisher

1. Sign in to the Visual Studio Marketplace management portal.
2. Create a new publisher.
3. Preferred publisher id: `klabo` (matches `package.json#publisher`).
4. Record the final publisher id:
   - If `klabo` is unavailable, choose a new id and update `package.json#publisher` (and any Marketplace links in docs/README).

## Verify with `vsce login`

After creating the publisher and an Azure DevOps PAT (see `docs/publishing/azure-devops-pat.md`):

```bash
npx vsce login klabo
```

`vsce` will prompt for the Personal Access Token. Do not paste tokens into docs or commits.

## Troubleshooting

- **“publisher not found”**: the publisher id may not exist yet, or you are logged into the wrong account.
- **Auth failures (401/403)**: confirm the PAT includes **Marketplace → Manage** and was created for **All accessible organizations**.
- **Name conflicts**: the Marketplace requires global uniqueness for `package.json#name`. If publishing reports a name collision, rename `package.json#name` and update the extension id everywhere.

## Optional: verified badge

Publisher verification (domain verification / “Verified” badge) is optional and not required to publish. If you complete verification later, keep this doc updated with the steps you followed.
