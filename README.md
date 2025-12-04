# Beads VS Code Extension

![Beads VS Code Extension](beads-visual.png)

This Visual Studio Code extension provides a simple explorer view for [Beads](https://github.com/steveyegge/beads) projects so that you can manage your beads without leaving the editor.

## Features

- **Dedicated Activity Bar**: Beads has its own dedicated view in the VS Code activity bar for easy access.
- **Tree View**: Explorer view that lists all beads for the current workspace with status-based icons.
- **Issue Type Icons**: Each issue type displays with a distinctive icon - epics (📦), tasks (☑️), bugs (🐛), features (💡), spikes (🧪), and chores (🔧) - making it easy to identify different work types at a glance.
- **Epic Grouping**: Group tasks by their parent epic using the "Toggle Sort Mode" command. Epics appear as expandable sections containing their child tasks, with ungrouped items shown in a separate section. Toggle between ID sort, status sort, and epic grouping modes.
- **Live Data Sync**: Automatically watches the Beads database for changes and refreshes the view in real-time.
- **Stale Task Warning**: Automatically detects and highlights in-progress tasks that have been stale for too long. A warning section at the top of the tree view shows tasks that exceed the configurable threshold, helping identify potentially stuck work or forgotten tasks.
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

# Run integration tests (requires VSCode, may not work on all macOS versions)
npm run test:integration

# Run linter
npm run lint
```

See [TESTING.md](TESTING.md) for more information about the test infrastructure.

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
