# GitHub Copilot Instructions for beads-vscode

## Project Overview

This is a **VS Code extension** that provides a GUI for [Beads](https://github.com/steveyegge/beads) - a lightweight issue tracker designed for AI coding agents. The extension integrates with the `bd` CLI tool to display and manage issues directly in VS Code's sidebar.

## Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code Extension API (vscode ^1.85.0)
- **Build**: TypeScript compiler (`tsc`)
- **Testing**: Mocha for unit tests, @vscode/test-electron for integration tests
- **Linting**: ESLint with TypeScript parser

## Architecture

### Main Files

- `src/extension.ts` - Main extension entry point containing:
  - `BeadsTreeDataProvider` - Tree view provider with drag-and-drop support
  - `BeadTreeItem` - Tree item representation
  - Webview panels for issue details and dependency visualization
  - All VS Code command handlers

- `src/utils.ts` - Pure utility functions (testable without VS Code):
  - `BeadItemData` interface - Core data model
  - `normalizeBead()` - Converts raw JSON to normalized format
  - `extractBeads()` - Extracts beads array from various JSON structures
  - Helper functions for HTML escaping, tooltips, error formatting

### Data Flow

1. Extension calls `bd export` CLI command to get issues as JSONL
2. Issues are normalized via `normalizeBead()` and displayed in tree view
3. Mutations use specific `bd` commands (`bd update`, `bd label add/remove`, `bd create`)
4. File watcher on `.beads/*.db` triggers automatic refresh

### Key Patterns

- **CLI Integration**: Always use `bd` CLI commands, never directly modify database files
- **State Sync**: Refresh view after every mutation
- **Error Handling**: Use `formatError()` helper, show user-friendly messages
- **Webview Communication**: Use `postMessage` pattern for webview ↔ extension communication

## Configuration

Extension settings in `package.json`:
- `beads.commandPath` - Path to `bd` CLI (default: "bd")
- `beads.projectRoot` - Override workspace root
- `beads.dataFile` - Path to data file (default: ".beads/issues.jsonl")

## Commands

All commands prefixed with `beads.`:
- `refresh`, `search`, `clearSearch` - View management
- `openBead`, `createBead`, `deleteBeads` - Issue CRUD
- `editExternalReference` - Edit external refs
- `visualizeDependencies` - Dependency graph webview
- `clearSortOrder`, `toggleSortMode` - Sorting

## Testing

```bash
npm run test:unit      # Fast unit tests (no VS Code required)
npm run test:bd-cli    # CLI integration tests
npm run test:integration # Full VS Code integration tests
npm run lint           # ESLint
```

Unit tests go in `src/test/unit/`, integration tests in `src/test/suite/`.

## Code Style Guidelines

- Use `void` for fire-and-forget promises: `void vscode.window.showErrorMessage(...)`
- Prefer async/await over raw promises
- Use `execFileAsync` (promisified) for CLI calls
- Include debug logging with `[Provider DEBUG]` or `[loadBeads DEBUG]` prefixes
- Keep webview HTML generation in dedicated functions (e.g., `getBeadDetailHtml()`)

### File System Guidelines

- **NEVER use `/tmp/` for temporary files** - macOS will prompt for permission
- **ALWAYS use the local `tmp/` directory** in the workspace root for temporary files
- The `tmp/` directory is gitignored and safe for development artifacts
- Example: `path.join(workspaceRoot, 'tmp', 'myfile.txt')` ✅
- Example: `/tmp/myfile.txt` ❌

## Common Tasks

### Adding a new command
1. Add command to `contributes.commands` in `package.json`
2. Register handler in `activate()` function
3. Add menu entries in `contributes.menus` if needed

### Calling the bd CLI
```typescript
const commandPath = await findBdCommand(configPath);
await execFileAsync(commandPath, ['subcommand', 'arg1', '--flag'], { cwd: projectRoot });
```

### Updating issue state
```typescript
async updateSomething(item: BeadItemData, value: string): Promise<void> {
  // 1. Get config and resolve paths
  // 2. Call bd command
  // 3. await this.refresh()
  // 4. Show success message
}
```

## Dependencies

- **Runtime**: None (extension uses built-in VS Code APIs)
- **Dev**: TypeScript, ESLint, Mocha, @vscode/test-electron, @vscode/vsce, @beads/bd
- **External**: `bd` CLI is included as a dev dependency (run via `npx bd`)

## Using bd for Issue Tracking

This project uses [Beads](https://github.com/steveyegge/beads) (`bd`) for issue tracking. CLI installed as dev dependency.

### Issue Hygiene

- **No personal names in titles.** Issue titles must stay role/area-focused (feature, surface, behavior). Do not include assignees or user names in titles; anyone can work on them.

### Quick Reference

```bash
# List & filter
npx bd list                          # All issues
npx bd list --status open            # By status: open, in_progress, closed
npx bd ready                         # Issues with no blockers (start here!)

# Create issues
npx bd create "Title" -p 1 -t task   # -p: priority 1-4, -t: task|bug|feature|epic
npx bd create "Title" -d "Details"   # -d: description

# Update & close
npx bd update bd-xyz --status in_progress
npx bd close bd-xyz --reason "Done"

# Dependencies (critical for task ordering)
npx bd dep add <child> <parent> --type blocks       # child blocked by parent
npx bd dep add <child> <parent> --type parent-child # hierarchy (epic→task)
npx bd dep add <a> <b> --type related               # informational link
npx bd dep tree bd-xyz                              # visualize deps

# Other
npx bd show bd-xyz                   # Issue details
npx bd search "query"                # Full-text search
npx bd stats                         # Project statistics
```

### Dependency Types

| Type | Use Case | Effect |
|------|----------|--------|
| `blocks` | Task A must complete before B | B won't appear in `bd ready` |
| `parent-child` | Epic contains tasks | Hierarchy only, no blocking |
| `related` | Cross-reference issues | Informational link |

**Note**: `child` type doesn't exist—use `parent-child` for hierarchy.

### Workflow

1. `npx bd create "Epic" -t epic -p 1` → Create epic
2. `npx bd create "Task" -t task -p 2` → Create tasks  
3. `npx bd dep add <task> <epic> --type parent-child` → Link to epic
4. `npx bd dep add <task2> <task1> --type blocks` → Set execution order
5. `npx bd ready` → See what's unblocked
6. `npx bd update <id> --status in_progress` → Start work
7. `npx bd close <id> --reason "Done"` → Complete

### JSON Output

All commands support `--json` for programmatic access:
```bash
npx bd list --json | jq '.[] | select(.status=="open")'
npx bd show bd-xyz --json
```
