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

This project uses [Beads](https://github.com/steveyegge/beads) (`bd`) for issue tracking. The CLI is installed as a dev dependency.

### Common Commands

```bash
# List all issues
npx bd list

# List issues by status
npx bd list --status open
npx bd list --status in_progress

# Show ready work (no blockers)
npx bd ready

# Create an issue
npx bd create "Fix bug in tree view" -p 1 -t bug
npx bd create "Add feature" -d "Description here" -p 2 -t feature

# Create with dependencies
npx bd create "Child task" --deps "blocks:bd-abc"

# View issue details
npx bd show bd-abc

# Update issue
npx bd update bd-abc --status in_progress
npx bd close bd-abc --reason "Completed"

# Manage dependencies
npx bd dep add bd-child bd-parent --type blocks
npx bd dep tree bd-abc

# Search issues
npx bd search "tree view"

# Show statistics
npx bd stats
```

### Issue Workflow

1. **Create issues** for new work: `npx bd create "Title" -t task -p 2`
2. **Add dependencies** if needed: `npx bd dep add <child> <parent>`
3. **Start work**: `npx bd update <id> --status in_progress`
4. **Complete work**: `npx bd close <id> --reason "Done"`

### JSON Output

All commands support `--json` for programmatic access:
```bash
npx bd list --json
npx bd show bd-abc --json
npx bd dep tree bd-abc --json
```
