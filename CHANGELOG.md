# Changelog

## Unreleased
- Add size guard script (`npm run check:size`) to flag files over 320 lines in src/ and tui/.
- Document modularization rollout/rollback steps and PR rebasing guidance.
- `npm run install-local` now installs the built VSIX and triggers a VS Code reload automatically (opt out with `NO_RELOAD_AFTER_INSTALL_LOCAL`); docs added for the flow.
