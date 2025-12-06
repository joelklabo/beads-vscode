# Quick Start - Install & Use

## Installing the Extension

### Option 1: One-command local install (auto reload)

```bash
npm install
npm run install-local
```

This packages the extension, installs the freshest `.vsix` via the VS Code CLI, and triggers `workbench.action.reloadWindow` so the updated build is active immediately.

- CLI resolution order: `code-insiders`, then `code` (override with `VSCODE_BIN`).
- Skip the reload by setting `NO_RELOAD_AFTER_INSTALL_LOCAL=1`.
- If no CLI is found, the command leaves the VSIX on disk and prints a warning so you can install manually.

### Option 2: Install from .vsix manually

1. **Package the extension:**
   ```bash
   npm install
   npm run bundle
   npm run check:vsix-size
   npx vsce package --follow-symlinks
   ```
   This creates `beady-0.1.0.vsix`

2. **Install in VSCode:**
   - Open VSCode
   - Go to Extensions view (Cmd/Ctrl+Shift+X)
   - Click the `...` menu at the top
   - Select "Install from VSIX..."
   - Choose the `beady-0.1.0.vsix` file

   **Or via command line:**
   ```bash
   code --install-extension beady-0.1.0.vsix
   ```

3. **Reload VSCode** (Cmd/Ctrl+Shift+P → "Developer: Reload Window")

### Option 3: Symlink for Development

If you're actively developing:

```bash
# macOS/Linux:
ln -s $(pwd) ~/.vscode/extensions/beady

# Windows (PowerShell as Admin):
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.vscode\extensions\beady" -Target (Get-Location)
```

Then reload VSCode.

---

## Monorepo layout & commands

- Shared packages live under `packages/` (`@beads/core`, `@beads/ui-headless`, platform adapters). VS Code wiring sits in `packages/platform-vscode`; web/TUI shells live in `web/` and `tui/`.
- Install once at the root: `npm install`
- Bundle runtime: `npm run bundle` (outputs `dist/extension.js` used by VS Code);
  `npm run test:bundle` smokes the bundle with a stubbed VS Code host and exits if the module fails to load.
- Build per surface: `npm run build:core`, `npm run build:vscode`, `npm run build:tui`, `npm run build:web`
- Tests: `npm run test:unit` (VS Code), `npm run test:core`, `npm run test:tui`, `npm run test:web:skeleton`, or `npm run test:all` for the whole matrix
- Size budget: `npm run check:vsix-size` packages a VSIX to a temp file and fails if it exceeds the ADR budget (override with `VSIX_MAX_BYTES`).
- All bd invocations run with `--no-daemon` via the shared CLI client; avoid touching `.beads` files directly.

## First Time Setup

### 1. Configure Your Beads Project

The extension needs to know where your beads data file is located.

**Option A: Use workspace folder (automatic)**
- Open your project folder in VSCode
- If you have `.beads/issues.jsonl` in your project root, it will work automatically

**Option B: Configure manually**
1. Open VSCode Settings (Cmd/Ctrl+,)
2. Search for "beads"
3. Set:
   - **Beady: Data File** - Path to your issues file (default: `.beads/issues.jsonl`)
   - **Beady: Project Root** - Override project root if needed
   - **Beady: Command Path** - Path to `beads` CLI (default: `beads`)

### 2. Create Test Data (Optional)

If you don't have a beads project yet, create a test file:

```bash
mkdir -p .beads
cat > .beads/issues.jsonl << 'EOF'
{"id":"TEST-1","title":"First test issue","status":"open","priority":2,"issue_type":"task"}
{"id":"TEST-2","title":"Second test issue","status":"in_progress","priority":1,"issue_type":"bug","labels":["urgent","backend"]}
{"id":"TEST-3","title":"Third test issue","status":"closed","priority":3,"issue_type":"feature","external_ref":"JIRA-123"}
EOF
```

---

## Using the Extension

### 1. Open the Beads Explorer

- Look for the Beads icon in the Activity Bar (left sidebar)
- Or use View menu → "Open View..." → "Beads"

### 2. View Your Issues

The tree view shows all your beads with:
- Issue ID and title
- Status badge (color-coded)
- Priority and labels
- External references

### 3. Available Commands

**Right-click on an issue:**
- **Open** - View full issue details in a webview panel
- **Edit External Reference** - Add/update external tracker links (JIRA, Linear, etc.)

**Toolbar buttons:**
- **Refresh** 🔄 - Reload issues from file
- **Create** ➕ - Create a new issue (requires `beads` CLI)

**Filter + sort:**
- The toolbar chip shows `Filter: <mode>` (Issues, Epics, Favorites, Recent, Blockers, etc.). Click it or run `Beady: Switch Filter Mode…` to change scopes; the same quick pick works keyboard-only and keeps the active label visible.
- Use `Beady: Toggle Sort Mode` to cycle to **assignee sort**; names sort case-insensitively with **Unassigned** pinned last.
- Rows always show assignee and status pills; press Space/Enter or the chevron to expand a row for labels, priority, updated time, and external refs without leaving the list.

**Keyboard shortcuts:**
- Click an issue to open its details

### 4. Dependency editing (optional)

1. Enable `beady.enableDependencyEditing` in VS Code settings (flagged preview; requires `bd` ≥ 0.29.0).
2. Open the **Dependency Tree** view (shows upstream/downstream for the currently selected issue).
3. Use the toolbar actions **Add Upstream** / **Add Downstream** to link issues. The picker prevents self-links, duplicates, and cycles before calling `bd dep add --no-daemon`.
4. Remove a link from the command palette with `Beady: Dependency Tree: Remove` or from the dependency section in the issue detail panel.

### 5. Auto-Refresh

The extension automatically watches your `.beads/issues.jsonl` file and refreshes when it changes.

---

## Common Issues

### Extension not appearing

1. Check the Extensions view - is "Beads Project Manager" installed and enabled?
2. Reload VSCode: Cmd/Ctrl+Shift+P → "Developer: Reload Window"
3. Check for errors: View → Output → Select "Beads" from dropdown

### "Unable to refresh beads list"

1. Verify your data file path in settings
2. Check that the file exists and is valid JSONL
3. Each line must be valid JSON
4. Check VSCode Output panel for specific errors

### Changes not appearing

1. Click the Refresh button in the Beads explorer
2. Check that the file watcher is working (it should auto-refresh)
3. Verify file permissions

### Create command not working

1. Ensure `beads` CLI is installed: `which beads`
2. Set `beady.commandPath` in settings if it's not in your PATH
3. Verify project root is set correctly

---

## Example Workflow

1. **Morning standup:**
   - Open Beads explorer
   - Review open issues
   - Click an issue to see full details

2. **Start work:**
   - Find issue in explorer
   - Click to open details
   - Update status via beads CLI or edit file directly

3. **Link to external tracker:**
   - Right-click issue
   - "Edit External Reference"
   - Enter JIRA/Linear/GitHub issue ID
   - Syncs to your `.beads/issues.jsonl` file

4. **Create new issue:**
   - Click ➕ in toolbar
   - Enter title
   - Issue created via beads CLI

---

## Uninstalling

1. Extensions view (Cmd/Ctrl+Shift+X)
2. Find "Beads Project Manager"
3. Click gear icon → Uninstall

Or via command line:
```bash
code --uninstall-extension klabo.beady
```

---

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute
- See [DISTRIBUTION.md](DISTRIBUTION.md) to publish your own version
- Check [README.md](README.md) for full documentation
- Report issues on [GitHub](https://github.com/joelklabo/beady/issues)

---

## Tips & Tricks

- **Filtering:** Currently view-all, but you can use Cmd/Ctrl+F in the details panel
- **Multi-workspace:** Set `beady.projectRoot` per workspace folder
- **Custom commands:** The beads CLI supports many operations - use terminal for advanced workflows
- **File format:** You can manually edit `.beads/issues.jsonl` - each line is independent JSON
