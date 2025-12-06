# Beady VS Code Extension
[![CI](https://github.com/joelklabo/beady/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/joelklabo/beady/actions/workflows/test.yml) [![VS Code Channels](https://img.shields.io/badge/vscode%20channels-stable%20%7C%20insiders-blue)](docs/testing-headless.md) [![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)](#testing)

![Beady VS Code Extension](beady-visual.png)

[![Test status](https://github.com/joelklabo/beady/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/joelklabo/beady/actions/workflows/test.yml)
[![Coverage](https://codecov.io/gh/joelklabo/beady/branch/main/graph/badge.svg)](https://codecov.io/gh/joelklabo/beady)

This Visual Studio Code extension provides a simple explorer view for [Beads](https://github.com/steveyegge/beads) projects so that you can manage your beads without leaving the editor.

## Architecture (high level)

The project is moving to a layered, multi-surface layout so VS Code, a web client, and the Ink-based TUI can share logic:
```
             bd CLI (--no-daemon)
                    |
              packages/core
                    |
             packages/ui-headless  (React hooks/state, no DOM/Ink)
              /                 \
      packages/ui-web      packages/ui-ink
           |                    |
          web app           tui app

             packages/platform-vscode (activation + wiring only)
```

Details and rules live in `docs/adr/2025-12-core-layering.md` and the short `docs/architecture.md` overview. `extension.ts` now stays lean (activation/wiring only) while domain logic, CLI calls, and stores sit in shared packages.

The Ink-based TUI also rides on the shared layers: it instantiates `BeadsStore` from `@beads/core`, calls the CLI through `BdCliClient` (which injects `--no-daemon` and sanitizes stderr), and routes mutating commands through `runGuardedBd` from `tui/lib/worktree` so the worktree guard script runs before any bd edits.

### Workspace layout & commands
- Bundle entrypoint: `npm run bundle` (outputs `dist/extension.js` used by VS Code); `npm run watch` runs bundle:watch + typecheck for F5.
- Build helpers: `npm run build:core`, `npm run build:vscode`, `npm run build:tui`, `npm run build:web` (skips if the web workspace is absent)
- Tests: `npm run test:unit` (VS Code), `npm run test:bundle` (bundle smoke), `npm run test:core`, `npm run test:tui`, `npm run test:web:skeleton`
- Size gate: `npm run check:vsix-size` (packages a VSIX and fails if the bundled VSIX exceeds the ADR budget)
- Full sweep: `npm run test:all` or `npm run ci:verify` (mirrors the CI **Test** workflow)
- All bd calls enforce `--no-daemon`; do not write directly to `.beads` DB files—go through the CLI/shared store

## Features

- **Dedicated Activity Bar**: Beads has its own dedicated view in the VS Code activity bar for easy access.
- **Tree View**: Explorer view that lists all beads for the current workspace with status-based icons.
- **Issue Type Icons**: Each issue type displays with a distinctive icon - epics (📦), tasks (☑️), bugs (🐛), features (💡), spikes (🧪), and chores (🔧) - making it easy to identify different work types at a glance.
- **Epic Grouping**: Group tasks by their parent epic using the "Toggle Sort Mode" command. Epics appear as expandable sections containing their child tasks, with ungrouped items shown in a separate section. Toggle between ID sort, status sort, and epic grouping modes.
- **Live Data Sync**: Automatically watches the Beads database for changes and refreshes the view in real-time.
- **Stale Task Warning**: Automatically detects and highlights in-progress tasks that have been stale for too long. A warning section at the top of the tree view shows tasks that exceed the configurable threshold, helping identify potentially stuck work or forgotten tasks. Closed items are never shown in this bucket.
- **Search**: Search across beads by ID, title, description, labels, status, assignee, and more.
- **Drag and Drop Sorting**: Manually reorder beads in the tree view with drag-and-drop support.
- **Dependency Visualization**: Interactive dependency graph showing relationships between beads with draggable nodes.
- **Rich Bead Details**: Click any bead to view a detailed panel with:
  - Full description, design notes, and acceptance criteria
  - Status, priority, issue type, and timestamps
  - Labels with quick add/remove functionality
  - External reference tracking
  - Dependency information
- **Inline Editing**: Edit bead status and labels directly from the detail view.
- **Quick Label Management**:
  - Add/remove custom labels
  - Quick "In Review" toggle button
- **Clickable URLs**: URLs in bead descriptions and notes are automatically converted to clickable links.
- **Delete Beads**: Remove beads with keyboard shortcuts (`Cmd+Backspace` on Mac, `Delete` on Windows/Linux) or via context menu.
- **CLI Integration**: Create new beads directly from VS Code using the `bd` CLI.
- **Natural Sorting**: Beads are sorted naturally by ID (handles numeric parts correctly).
- **Feedback entry points**: When the feedback feature flag is enabled and configured, submit feedback from the command palette, the Beads explorer toolbar, bead context menu, or the status bar (when no stale warning is showing).

The extension integrates with the Beads CLI (`bd`) and reads from the Beads database (`.beads/*.db`). Changes are automatically reflected in the UI through file system watchers.

### Stale / Warning bucket
- Shows tasks marked `in_progress` whose `inProgressSince` exceeds `beads.staleThresholdMinutes` (default 10 minutes).
- Highlights empty epics that are not closed so they can be filled or closed intentionally.
- Closed tasks and epics never appear in the Warning bucket, even if they still have an old in-progress timestamp.
- The Warning bucket sits above other sections; blocked/open items stay in their usual sections unless they become in progress and stale.



## CI & Testing
- CI: see the Test workflow badge above (runs lint, unit, integration on Ubuntu/macOS/Windows, Node 18/20).
- Headless/channel scripts: `npm run test:integration:stable`, `npm run test:integration:insiders`, `npm run test:integration:headless` (Linux wraps `xvfb-run -a`).
- Env: set `VSCODE_TEST_CHANNEL` and optional `VSCODE_TEST_INSTANCE_ID` to isolate parallel runs; temp dirs live under `tmp/` in the repo and are auto-cleaned after runs.
- Cleanup: remove stale temp dirs with `npm run test:clean-temp`.
- Details: see [docs/testing-headless.md](docs/testing-headless.md). TUI visual snapshot workflow (pseudo-PTY harness, baselines, reports) lives in [TESTING.md](TESTING.md#tui-visual-snapshots-headless-harness) with design notes in [docs/design/tui-visual-testing.md](docs/design/tui-visual-testing.md).

## Commands

| Command | Description |
| --- | --- |
| `Beads: Refresh` | Manually reload bead data from the database. |
| `Beads: Search` | Search beads by ID, title, description, labels, status, and more. |
| `Beads: Clear Search` | Clear the current search filter and show all beads. |
| `Beads: Open` | Open a detailed view panel for the selected bead with full information and editing capabilities. |
| `Beads: Edit External Reference` | Update the external reference identifier stored for the bead. |
| `Beads: Create` | Create a new bead by prompting for a title and invoking `bd create`. |
| `Beads: Visualize Dependencies` | Open an interactive dependency graph showing relationships between beads. |
| `Beads: Send Feedback` | Open the configured feedback flow (command palette, Beads toolbar, bead context menu, or status bar when enabled). |
| `Beads: Toggle Sort Mode` | Cycle through view modes: ID sort → Status grouping → Epic grouping. Epic mode shows tasks grouped under their parent epics. |
| `Beads: Clear Manual Sort Order` | Reset manual drag-and-drop sorting and return to natural ID-based sorting. |
| `Beads: Delete` | Delete selected bead(s) from the project. |

## Keyboard Shortcuts

| Shortcut | Platform | Action |
| --- | --- | --- |
| `Cmd+Backspace` | macOS | Delete selected bead(s) |
| `Delete` | Windows/Linux | Delete selected bead(s) |
| `Backspace` | All | Delete selected bead(s) (when tree view is focused) |

## Settings

- `beads.commandPath`: Path to the Beads CLI executable. Defaults to `bd`.
- `beads.projectRoot`: Optional override for the working directory used when invoking the CLI or resolving relative data file paths.
- `beads.dataFile`: Path to the Beads data file. Defaults to `.beads/issues.jsonl` (supports both JSONL and JSON formats).
- `beads.cli.timeoutMs`: Per-command timeout (ms) for bd invocations; defaults to `15000`.
- `beads.cli.retryCount`: Number of retry attempts after a timeout; defaults to `1` (set `0` to disable).
- `beads.cli.retryBackoffMs`: Delay in milliseconds before each retry; defaults to `500`.
- `beads.offlineDetection.thresholdMs`: Total elapsed time across attempts before treating bd as offline; defaults to `30000`.
- `beads.staleThresholdMinutes`: Number of minutes after which an in-progress task is highlighted as stale. Defaults to `10` minutes. Tasks in progress longer than this threshold will appear in a "⚠️ Stale Tasks" warning section at the top of the tree view, helping identify potentially stuck work or forgotten tasks.
- `beads.feedback.enabled`: Opt-in flag for the feedback flow. When off (default) all feedback commands/UI stay hidden.
- `beads.feedback.repository`: GitHub target in `owner/repo` form. Required when enabling feedback.
- `beads.feedback.labels`: Map feedback types (bug, feature, question, other) to GitHub labels. Defaults to `bug`, `enhancement`, `question`, and `feedback`.
- `beads.feedback.useGitHubCli`: Prefer the `gh` CLI for submissions when available. Defaults to `false`.
- `beads.feedback.includeAnonymizedLogs`: Allow attaching sanitized logs/metadata when sending feedback (default: `true`).
- `beads.enableDependencyEditing`: Experimental flag (default: `false`) to show dependency add/remove UI. Requires `bd` CLI version `>= 0.29.0`; the extension will warn if the CLI is too old.
- `beads.bulkActions.enabled`: Experimental flag (default: `false`) to surface bulk status/label commands. When off, bulk commands and menus stay hidden.
- `beads.bulkActions.maxSelection`: Maximum number of items allowed in a single bulk action (default: `50`, valid range `1-200`). Invalid values fall back to the default.

## How to Use

### Basic Workflow

1. **View Beads**: Click the Beads icon in the activity bar to see all your issues
2. **Search**: Click the search icon to filter beads by any field
3. **View Details**: Click any bead to open a detailed view with full information
4. **Edit Status/Labels**: Click "Edit" in the detail view to modify status and labels
5. **Visualize**: Click the graph icon to see dependency relationships
6. **Reorder**: Drag and drop beads to customize the order (persisted per workspace)

### View Modes

The extension supports three view modes that you can cycle through using the "Toggle Sort Mode" command:

1. **ID Sort** (default): Beads are sorted naturally by ID
2. **Status Grouping**: Beads are grouped into collapsible sections by status (Open, In Progress, Blocked, Closed)
3. **Epic Grouping**: Beads are grouped under their parent epics. Epics appear as expandable sections with their child tasks nested underneath. Tasks without a parent epic are shown in an "Ungrouped" section.

### Filters and badges

- Use the explorer toolbar chip labeled `Filter: <mode>` (Issues, Epics, Favorites, Recent, Blockers, etc.). Click it or run `Beads: Switch Filter Mode…` (Cmd/Ctrl+Shift+P) to open the same quick pick with scope hints; the active label stays visible in high-contrast themes.
- Every row shows an assignee pill plus a colored status badge even when collapsed. In **assignee sort** (cycle with `Beads: Toggle Sort Mode`), names sort case-insensitively with **Unassigned** pinned to the bottom.
- Press **Space/Enter** or click the chevron to expand a row for labels, priority, external reference, and updated time without leaving the list. Focus order and `aria-expanded` stay in sync, and user-provided text is HTML-escaped in tooltips/markdown for safety.
- See [docs/filters-assignee.md](docs/filters-assignee.md) for deeper UX/accessibility notes.

### Dependency tree editing (preview)

1. Turn on the `beads.enableDependencyEditing` setting (requires `bd` ≥ 0.29.0); commands always run with `--no-daemon`.
2. Open the **Dependency Tree** view in the Beads sidebar—selecting an issue in the main tree syncs the upstream/downstream branches shown here.
3. Use the view toolbar actions **Add Upstream** and **Add Downstream** to link issues; the quick pick blocks self-links, duplicates, and cycles before calling `bd dep add`.
4. Remove a link via the command palette (`Beads: Dependency Tree: Remove`) or the remove buttons in the issue detail panel; failures surface as warnings without breaking focus.
5. See [docs/dependency-tree.md](docs/dependency-tree.md) for keyboard/a11y notes and troubleshooting.

### Issue Type Icons

Each issue type displays with a distinctive icon based on status color:

- 📦 **Epic**: Large initiatives (icon: `symbol-package`)
- ☑️ **Task**: Actionable work items (icon: `checklist`)
- 🐛 **Bug**: Issues to fix (icon: `bug`)
- 💡 **Feature**: New capabilities (icon: `lightbulb`)
- 🧪 **Spike**: Research or investigation (icon: `beaker`)
- 🔧 **Chore**: Maintenance work (icon: `tools`)

Closed items always show a green checkmark (✅) regardless of type.

### Status Icons

- 🟢 **Green checkmark**: Closed
- 🟡 **Yellow clock**: In Progress
- 🔴 **Red error**: Blocked
- 🔵 **Blue circle**: Open
- ⚠️ **Warning section**: Stale tasks (in-progress tasks that have exceeded the configured time threshold)

## Development

Install dependencies and compile the extension:

```bash
npm install
npm run compile
```

### Testing

Run the test suite:

```bash
# Run unit tests (default, fast, no VSCode required)
npm test

# Run integration tests (headless; set VSCODE_TEST_CHANNEL=stable|insiders as needed)
npm run test:integration:headless

# Run linter
npm run lint
```

See [TESTING.md](TESTING.md) for more information about the test infrastructure.

### Accessibility & security
- Accessibility checklist: [docs/accessibility.md](docs/accessibility.md)
- Tooltip sanitization/security notes: [docs/tooltips/hover-rules.md](docs/tooltips/hover-rules.md)

### CI & coverage parity

- `npm run ci:verify` mirrors the GitHub Actions **Test** workflow (lint + localization + unit + headless integration). Use `VSCODE_TEST_CHANNEL` / `VSCODE_TEST_INSTANCE_ID` to match the matrix locally.
- `npm run ci:integration` runs a single headless integration pass; use `ci:unit` for just the compiled unit suite.
- `npm run ci:coverage` generates text and LCOV coverage reports in `coverage/` (open `coverage/lcov-report/index.html`).
- Workflow details and badges: [docs/ci.md](docs/ci.md).

### Bundling & size budget

- Runtime entrypoint lives in `dist/extension.js`; build it with `npm run bundle` (or keep it live with `npm run watch`).
- Smoke the bundle with `npm run test:bundle` (requires `npm run compile` + bundle and ensures the bundled module loads with a stubbed VS Code host).
- Enforce the VSIX budget from the [bundling ADR](docs/adr/2025-12-vscode-bundling.md) via `npm run check:vsix-size` (packs a VSIX to a temp path and fails if it exceeds the budget; override with `VSIX_MAX_BYTES`).
- Publishing/packaging will reuse the bundle; see the `.vscodeignore` rationale in the ADR for what ships vs. gets trimmed.

### Install local build (auto-reload)

Use the built-in helper to package, install, and reload the active VS Code window in one step:

```bash
npm run install-local
```

- Prefers `code-insiders` if available, otherwise falls back to `code` (override with `VSCODE_BIN`).
- Skips the reload when `NO_RELOAD_AFTER_INSTALL_LOCAL=1` is set; otherwise it runs `workbench.action.reloadWindow` after install so the new VSIX is active immediately.
- If no VS Code CLI is found, the script leaves the VSIX on disk and prints a warning so you can install manually.

### Multi-Agent Workflow

For the hardened worktree-based multi-agent flow (atomic claims, merge queue, heartbeats, WAL), see [docs/MULTI_AGENT_ORCHESTRATION.md](docs/MULTI_AGENT_ORCHESTRATION.md).

### Security

Little Glen webviews/hovers are being hardened with strict CSP and HTML sanitization. See [docs/security/little-glen-csp.md](docs/security/little-glen-csp.md) and [docs/security/little-glen-sanitization.md](docs/security/little-glen-sanitization.md) for the current plan.

### Running the Extension

Launch the extension using the **Run > Start Debugging** command in VS Code. This will open a new Extension Development Host window with the Beads explorer view.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Distribution

See [DISTRIBUTION.md](DISTRIBUTION.md) for information on:

- Publishing to VS Code Marketplace
- Creating GitHub releases
- Local installation methods
- Setting up continuous deployment

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Resources

- [Beads CLI](https://github.com/steveyegge/beads) - The core Beads project management tool
- [VS Code Extension API](https://code.visualstudio.com/api) - For contributing to this extension
