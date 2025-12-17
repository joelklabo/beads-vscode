# Gate: Marketplace package ready

Date: 2025-12-17

This gate confirms the packaged VSIX and Marketplace-facing metadata/docs are ready.

## Verification checklist

- [x] VSIX packages successfully:
  - `npx vsce package --follow-symlinks`
- [x] README renders and links are Marketplace-safe:
  - External links used for files excluded from the VSIX (e.g., `AGENTS.md`, `CONTRIBUTING.md`).
- [x] Icon renders:
  - `package.json#icon` → `media/icon.png` (included in VSIX).
- [x] Screenshot included in README:
  - `media/screenshot.png` (included in VSIX).
- [x] `CHANGELOG.md` is present and packaged.
- [x] VSIX size within budget:
  - `npm run check:size`
- [x] VSIX contents audit passes:
  - `npm run check:vsix-contents`

## Notes / follow-ups

- If Marketplace badge rendering blocks `img.shields.io`, remove or replace badges with an approved source.
