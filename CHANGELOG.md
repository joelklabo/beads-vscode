# Changelog

## Unreleased
- Add size guard script (`npm run check:size`) to flag files over 320 lines in src/ and tui/.
- Document modularization rollout/rollback steps and PR rebasing guidance.
- `npm run install-local` now installs the built VSIX and triggers a VS Code reload automatically (opt out with `NO_RELOAD_AFTER_INSTALL_LOCAL`); docs added for the flow.
- Documented the dependency tree editing preview (enable with `beads.enableDependencyEditing`): upstream/downstream tree view actions, bd `--no-daemon` usage, a11y focus/labels, and safe cycle/duplicate guards.
- Documented clearer filter selection (toolbar chip + command palette), always-on assignee/status badges, and expandable rows in README/QUICKSTART; includes keyboard/high-contrast notes and HTML-escaping of user strings.
