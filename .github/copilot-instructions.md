# Agent Instructions for beads-vscode

> **For AI coding agents.** This document defines how to work in this repository, with emphasis on bd CLI commands and worktree workflows.

## Project Overview

This is a **VS Code extension** that provides a GUI for [Beads](https://github.com/steveyegge/beads) - a lightweight issue tracker designed for AI coding agents. The extension integrates with the `bd` CLI tool to display and manage issues directly in VS Code's sidebar.

## ⚠️ Critical: Worktree Environment

**This project uses git worktrees for multi-agent development.** The daemon mode does NOT work correctly with worktrees because all worktrees share the same `.beads` database.

### Required: Always Use `--no-daemon`

**Every `bd` command MUST include `--no-daemon`** to bypass the daemon and operate directly on the database. This prevents commits/pushes to the wrong branch.

```bash
# ✅ CORRECT - All commands use --no-daemon
npx bd --no-daemon ready --json
npx bd --no-daemon list --status open --json
npx bd --no-daemon create "Title" -d "Description" -t task -p 2 --json

# ❌ WRONG - Missing --no-daemon (will use daemon, may corrupt worktree state)
npx bd ready --json
```

### Alternative: Set Environment Variable

For an entire session, you can set:
```bash
export BEADS_NO_DAEMON=1
npx bd ready --json  # Now uses direct mode automatically
```

---

## bd CLI Quick Reference

**All commands require `--no-daemon` and should use `--json` for programmatic output.**

### Finding Work

```bash
# See unblocked issues (START HERE)
npx bd --no-daemon ready --json

# Filter ready work
npx bd --no-daemon ready --json --limit 20
npx bd --no-daemon ready --json --priority 1
npx bd --no-daemon ready --json --assignee alice

# See blocked issues
npx bd --no-daemon blocked --json

# Find stale/forgotten issues
npx bd --no-daemon stale --days 30 --json
```

### Viewing Issues

```bash
# List all issues
npx bd --no-daemon list --json

# Filter by status
npx bd --no-daemon list --status open --json
npx bd --no-daemon list --status in_progress --json
npx bd --no-daemon list --status closed --json

# Filter by priority (0=critical, 1=high, 2=medium, 3=low, 4=backlog)
npx bd --no-daemon list --priority 1 --json

# Filter by assignee
npx bd --no-daemon list --assignee alice --json

# Show specific issue details
npx bd --no-daemon show <issue-id> --json
```

### Creating Issues

```bash
# Create a task (default type)
npx bd --no-daemon create "Task title" \
  -d "Detailed description of what needs to be done" \
  -p 2 \
  -t task \
  --json

# Create with type: bug, feature, task, epic, chore
npx bd --no-daemon create "Fix login bug" -t bug -p 1 --json
npx bd --no-daemon create "Add OAuth support" -t feature -p 2 --json
npx bd --no-daemon create "Q4 Platform Improvements" -t epic -p 1 --json

# Create with inline dependencies
npx bd --no-daemon create "Subtask" \
  -d "Description" \
  -p 2 \
  --deps "discovered-from:bd-abc" \
  --json

# Create with labels
npx bd --no-daemon create "Security fix" -t bug -p 0 -l security,urgent --json

# Create with assignee
npx bd --no-daemon create "Task" -t task -a alice --json
```

### Updating Issues

```bash
# Update status
npx bd --no-daemon update <issue-id> --status in_progress --json
npx bd --no-daemon update <issue-id> --status open --json

# Update priority
npx bd --no-daemon update <issue-id> --priority 1 --json

# Update assignee
npx bd --no-daemon update <issue-id> --assignee bob --json

# Update title/description
npx bd --no-daemon update <issue-id> --title "New title" --json
npx bd --no-daemon update <issue-id> -d "New description" --json

# Add/remove labels
npx bd --no-daemon update <issue-id> --add-label urgent --json
npx bd --no-daemon update <issue-id> --remove-label wontfix --json
```

### Closing Issues

```bash
# Close with reason
npx bd --no-daemon close <issue-id> --reason "Implemented" --json

# Close multiple issues
npx bd --no-daemon close bd-abc bd-def bd-ghi --reason "Batch complete" --json
```

### Dependencies

```bash
# Add dependency: <issue-id> is blocked by <depends-on-id>
# Syntax: bd dep add <issue-that-depends> <issue-it-depends-on>
npx bd --no-daemon dep add bd-child bd-parent --type blocks --json

# Dependency types:
# - blocks (default): Hard blocker, affects bd ready
# - parent-child: Hierarchical (epic→task), no blocking
# - related: Informational link, no blocking
# - discovered-from: Issue found during work on another

# Examples:
npx bd --no-daemon dep add bd-task bd-epic --type parent-child --json
npx bd --no-daemon dep add bd-a bd-b --type related --json
npx bd --no-daemon dep add bd-new bd-current --type discovered-from --json

# Remove dependency
npx bd --no-daemon dep remove bd-child bd-parent --json

# View dependency tree
npx bd --no-daemon dep tree <issue-id> --json

# Detect cycles
npx bd --no-daemon dep cycles --json
```

### Other Commands

```bash
# Database info
npx bd --no-daemon info --json

# Statistics
npx bd --no-daemon stats --json

# Search
npx bd --no-daemon search "query" --json

# Sync (manual)
npx bd --no-daemon sync
```

---

## Dependency Direction (Critical!)

**The dependency direction is: `bd dep add <dependent> <dependency>`**

Think of it as: "Issue A **depends on** Issue B" → `bd dep add A B`

```bash
# Task needs epic to exist first (parent-child)
npx bd --no-daemon dep add bd-task bd-epic --type parent-child --json

# Feature B requires Feature A to be done first (blocks)
npx bd --no-daemon dep add bd-feature-b bd-feature-a --type blocks --json

# ❌ WRONG: This makes the epic depend on the task!
npx bd --no-daemon dep add bd-epic bd-task --type parent-child --json
```

### Verification

After adding dependencies, verify with:
```bash
npx bd --no-daemon blocked --json
# Tasks should be blocked by their prerequisites
```

---

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
await execFileAsync(commandPath, ['--no-daemon', 'subcommand', 'arg1', '--flag', '--json'], { cwd: projectRoot });
```

### Updating issue state
```typescript
async updateSomething(item: BeadItemData, value: string): Promise<void> {
  // 1. Get config and resolve paths
  // 2. Call bd command with --no-daemon
  // 3. await this.refresh()
  // 4. Show success message
}
```

## Dependencies

- **Runtime**: None (extension uses built-in VS Code APIs)
- **Dev**: TypeScript, ESLint, Mocha, @vscode/test-electron, @vscode/vsce, @beads/bd
- **External**: `bd` CLI is included as a dev dependency (run via `npx bd`)

---

## Issue Hygiene

- **No personal names in titles.** Issue titles must stay role/area-focused (feature, surface, behavior). Do not include assignees or user names in titles; anyone can work on them.
- **Always include descriptions.** Every issue should explain why it exists, what needs to be done, and how it was discovered (if applicable).
- **Use `## Files` section.** List specific files to be modified for worker coordination.

### Issue Types

| Type | Use Case |
|------|----------|
| `epic` | Large feature composed of multiple issues |
| `feature` | User-facing functionality |
| `task` | Implementation work, tests, docs, refactoring |
| `bug` | Something broken that needs fixing |
| `chore` | Maintenance work (dependencies, tooling) |

### Priorities

| Priority | Meaning |
|----------|---------|
| `0` | Critical: security, data loss, broken builds |
| `1` | High: major features, important bugs |
| `2` | Medium: default, nice-to-have features |
| `3` | Low: polish, optimization |
| `4` | Backlog: future ideas |

### Dependency Types

| Type | Use Case | Effect on `bd ready` |
|------|----------|----------------------|
| `blocks` | Hard dependency - A must complete before B | B hidden until A closed |
| `parent-child` | Hierarchical (epic→task) | No blocking effect |
| `related` | Cross-reference | No blocking effect |
| `discovered-from` | Found during work on another issue | No blocking effect |

---

## Worktree Workflow for Multi-Agent Development

This project uses `./scripts/task-worktree.sh` for isolated agent work:

```bash
# Start a task (creates worktree, marks in_progress)
./scripts/task-worktree.sh start <worker-name> <task-id>
cd /path/to/worktrees/<worker-name>/<task-id>

# Verify you're in the correct worktree
./scripts/task-worktree.sh verify <task-id>

# After work is complete
./scripts/task-worktree.sh finish <worker-name> <task-id>

# Check status of all worktrees
./scripts/task-worktree.sh status

# Cleanup worker's worktrees
./scripts/task-worktree.sh cleanup <worker-name>
```

### Key Rules for Worktree Workflow

1. **Never modify main repo directly** - Always work in worktrees
2. **Always verify location** before editing: `./scripts/task-worktree.sh verify <task-id>`
3. **Check for file conflicts** before starting a task - compare `## Files` sections of in_progress tasks
4. **bd commands always point to main repo's `.beads`** - The script handles this

---

## Example: Complete Workflow

```bash
# 1. Find ready work
npx bd --no-daemon ready --json

# 2. Check for conflicts with in_progress tasks
npx bd --no-daemon list --status in_progress --json

# 3. Start the task
./scripts/task-worktree.sh start agent-1 bd-abc123
cd /Users/honk/code/worktrees/agent-1/bd-abc123

# 4. Verify location
./scripts/task-worktree.sh verify bd-abc123

# 5. View task details
npx bd --no-daemon show bd-abc123 --json

# 6. Implement, test, commit
npm run compile && npm run lint && npm run test:unit
git add -A
git commit -m "bd-abc123: Implement feature X"

# 7. Finish (merge to main, cleanup)
./scripts/task-worktree.sh finish agent-1 bd-abc123
```
