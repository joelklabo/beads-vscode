# install-local reload flow

Purpose: ensure `npm run install-local` installs the VSIX and then reloads the active VS Code window so the updated extension is loaded immediately.

## Steps
1) Build/package the VSIX (existing install-local behavior).
2) Resolve VS Code CLI binary:
   - Use `VSCODE_BIN` if set.
   - Else try `code-insiders`, then `code`.
3) Unless `NO_RELOAD_AFTER_INSTALL_LOCAL=1`, invoke:
   ```bash
   "$VSCODE_BIN" --command workbench.action.reloadWindow
   ```
   Warn (do not fail) if the CLI is unavailable or the reload command errors.

## Environment variables
- `VSCODE_BIN`: override CLI path (e.g., `/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`).
- `NO_RELOAD_AFTER_INSTALL_LOCAL`: set to `1` to skip the reload step.

## Failure handling
- Missing CLI: print a warning and exit success after install.
- Reload failure: print a warning; do not change install exit code.

## Notes
- Supports both stable and insiders; whichever CLI resolves will be used.
- Reload targets the currently active window managed by the chosen CLI.
