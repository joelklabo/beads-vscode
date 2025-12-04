# Beads VSCode Extension - Interface Design

## Overview

This document defines the interface between the VSCode extension and the beads backend for reliable state management.

## Backend Architecture

Beads uses a **SQLite database** as the source of truth, not JSONL files. The architecture follows an LSP-like pattern:

```
VSCode Extension
    ↓
bd CLI (command-line interface)
    ↓
Per-Project Daemon (optional, auto-started)
    ↓
SQLite Database (.beads/*.db)
```

## Interface Options

### Option 1: BD CLI (Current Implementation)

**Command**: `bd` (installed via homebrew, pip, or go)
**Location**: Should be in PATH (e.g., `/opt/homebrew/bin/bd`)

**Advantages**:
- Simple, no additional dependencies
- Works immediately
- Automatic daemon management (auto-starts if configured)

**Disadvantages**:
- Need to parse JSON output
- Subprocess overhead
- Less structured error handling

**Usage**:
```bash
bd list --json                          # List all issues
bd update <id> --status <status>        # Update status
bd label add <id> <label>               # Add label
bd label remove <id> <label>            # Remove label
bd create <title> --priority <n>        # Create issue
bd show <id> --json                     # Get issue details
```

### Option 2: MCP Server (Recommended for AI)

**NOT suitable for VSCode extension** - MCP is designed for AI agents (Claude, etc.), not for programmatic use by extensions.

The VSCode extension should use the BD CLI directly.

## Reliable State Management Interface

### Core Principles

1. **Always use BD CLI commands** - Never directly modify JSONL or database files
2. **Use JSON output** - All read operations should use `--json` flag for structured data
3. **Refresh after mutations** - After any create/update/delete, refresh the view
4. **Handle command not found** - Gracefully handle when `bd` is not in PATH

### Configuration

```typescript
interface BeadsConfig {
  commandPath: string;  // Default: "bd" (expects bd in PATH)
  projectRoot: string;  // Default: workspace root
}
```

### Operations

#### 1. List Issues
```bash
bd list --json
```
Returns array of issues with all fields.

#### 2. Update Status
```bash
bd update <issue-id> --status <open|in_progress|blocked|closed>
```

**Important**: Use `bd close <id>` for closing (respects approval workflows), not `bd update <id> --status closed`

#### 3. Add Label
```bash
bd label add <issue-id> <label-name>
```

#### 4. Remove Label
```bash
bd label remove <issue-id> <label-name>
```

#### 5. Create Issue
```bash
bd create <title> --priority <1-4>
```

#### 6. Get Issue Details
```bash
bd show <issue-id> --json
```

### Error Handling

```typescript
interface CommandError {
  type: 'NOT_FOUND' | 'EXECUTION_ERROR' | 'PARSE_ERROR';
  message: string;
  stderr?: string;
}
```

**Handle these cases**:
1. `ENOENT` - bd command not found in PATH
   - Show helpful error: "bd command not found. Please install beads CLI."
2. Non-zero exit code - Command failed
   - Parse stderr for user-friendly error
3. Invalid JSON - Failed to parse output
   - Show parse error with raw output

### State Synchronization

**Pattern**:
```typescript
async function updateState(issueId: string, mutation: () => Promise<void>) {
  try {
    await mutation();           // Execute bd command
    await this.refresh();       // Reload from database
    showSuccessMessage();
  } catch (error) {
    handleError(error);
    // Don't refresh on error - keep current state
  }
}
```

### File Watching

Watch the `.beads/*.db` files (not JSONL) for external changes:
```typescript
const pattern = new vscode.RelativePattern(
  projectRoot,
  '.beads/*.{db,db-wal,db-shm}'
);
```

When database changes, refresh the view automatically.

## Command Resolution

### Finding BD Command

1. Check user config `beads.commandPath`
2. Try `bd` in PATH
3. Try common locations:
   - `/opt/homebrew/bin/bd` (Homebrew on Apple Silicon)
   - `/usr/local/bin/bd` (Homebrew on Intel Mac)
   - `~/.local/bin/bd` (pip/pipx install)
   - `~/go/bin/bd` (go install)

### Implementation

```typescript
async function findBdCommand(config: BeadsConfig): Promise<string> {
  const configPath = config.commandPath;

  // If user specified a path, use it
  if (configPath && configPath !== 'bd') {
    if (await fileExists(configPath)) {
      return configPath;
    }
    throw new Error(`Configured bd path not found: ${configPath}`);
  }

  // Try 'bd' in PATH first
  try {
    await execFile('bd', ['--version']);
    return 'bd';
  } catch (err) {
    // Fall through to try common locations
  }

  // Try common installation locations
  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const p of commonPaths) {
    if (await fileExists(p)) {
      return p;
    }
  }

  throw new Error('bd command not found. Please install beads CLI.');
}
```

## Testing the Interface

### Manual Testing Checklist

1. ✅ Update issue status from webview
2. ✅ Add label from webview
3. ✅ Remove label from webview
4. ✅ Create new issue
5. ✅ View refreshes after external changes (run `bd update` in terminal)
6. ✅ Graceful error when bd not found
7. ✅ Graceful error when invalid project root

### Automated Testing

Test with mocked `execFile`:
- Success cases return valid JSON
- Error cases throw appropriate errors
- Verify refresh called after mutations

## Future Enhancements

### Phase 1 (Current)
- ✅ Read issues via `bd list --json`
- ✅ Update status via `bd update`
- ✅ Manage labels via `bd label`
- ✅ Watch database for external changes

### Phase 2 (Future)
- Add dependency management UI
- Add issue creation form with all fields
- Add bulk operations
- Add keyboard shortcuts

### Phase 3 (Future)
- Integrate with VSCode tasks
- Add git commit message templates

## Worktree Guard Interface (new)

### Canonical identity
- `worktreeId = <worker>/<task-id>` (matches branch name and directory suffix)
- Path: `<repo>/../worktrees/<worker>/<task-id>`
- Branch: same as worktreeId

### Guard command
`bd worktree guard [--fix] [--json]`
- Detects duplicate/missing worktrees, stale heartbeats, stuck locks, branch/path mismatches.
- Uses shared locks (`.beads/locks/claim-*.lock`, `.beads/merge.lock`) and heartbeats in `.beads/heartbeats/`.
- All bd calls run with `BEADS_NO_DAEMON=1` and explicit `BEADS_DIR`.

### VS Code integration
- Before finishing/merging from the UI, optionally run guard in read-only mode and block if violations exist.
- Surface guard findings in Problems panel with quick-fix links (cleanup, reopen task, prune worktree).
- Activity feed entries should include `worktreeId` so duplicates can be deduped per task.

### Shared helpers
- `resolveWorktreeId(pathOrBranch)` → {worker, taskId, branch}
- `isCanonicalWorktreePath(path)` → boolean
- `listWorktrees()` → normalized list from `git worktree list --porcelain`
- `runGuard({fix?: boolean, format?: 'json'|'text'})` → parsed results for UI/TUI.
- Add issue templates
- Add custom views (by priority, assignee, etc.)

## AI Workflows & UX Contract (beads-vscode-19i)

### Surfaces
- **Chat participant (`@beads`)**: Copilot/vscode.lm chat + inline chat.
- **Quick actions**: command palette / quick pick (“Summarize bead”, “Draft update”, “Suggest next step”).
- **Risk scorer**: background LM classifying risk/staleness with mitigations (opt-in).
- **Onboarding helper**: short tips + guard remediation guidance.

### Shared context payload
```jsonc
{
  "bead": { "id": "ABC-123", "title": "...", "status": "in_progress", "labels": ["frontend"], "parentId": "EPIC-9", "updatedAt": "2025-12-01T18:10:11Z" },
  "selection": { "file": "src/foo.ts", "start": 120, "end": 145, "text": "selected code" },
  "worktree": { "id": "Marvin/beads-vscode-123", "path": "/Users/.../worktrees/Marvin/beads-vscode-123" },
  "telemetryConsent": true,
  "modelHints": { "provider": "copilot|openai|ollama", "family": "gpt-4.1|gpt-5|gemini" }
}
```

### Prompt templates (summaries)
- **Chat ask (bead-aware)**  
  ```
  System: You are Beads assistant. Keep responses concise; prefer actionable steps.
  Context: {bead fields, optional selection, worktree id}
  User: {user message}
  ```
- **Quick action: Summarize bead** — Summarize for standup in ≤80 words using id/title/status/labels/blockers.
- **Quick action: Next step** — Output JSON: {"next_step":"...","rationale":"...","confidence":0-1}
- **Risk scorer** — Input: status, updatedAt, blockingDepsCount, labels. Output JSON: {"risk":"high|medium|low","reason":"...","actions":["..."]}.
- **Onboarding tip** — Explain create/search/update + worktree guard in <120 words; no links except http/https.

### Sequence sketch (chat)
```
User → Chat UI → Beads participant
  ↳ Gather context (bead + selection + worktree + consent)
  ↳ Build prompt + model hints
  → LM call (Copilot or vscode.lm provider)
  ← Response
  ↳ Render markdown/actions; on error show toast + fallback quick-pick “Copy prompt” / “Retry smaller context”
```

### Error / fallback matrix
| Condition | UX | Notes |
| --- | --- | --- |
| No model available | Toast: “AI unavailable. Configure provider or Copilot.” Offer settings command. | Do not open browser automatically. |
| Timeout / rate limit | Toast with retry + backoff; log to output channel without PII. | Honor Retry-After. |
| Context too large | Offer resend with truncated selection; show token estimate. | Never drop text silently. |
| Workspace not trusted | Block and prompt to enable trust. | |
| Telemetry off | Skip analytics; allow LM if user key provided. | |

### Inputs / outputs per surface
- **Chat**: input = text + context; output = sanitized markdown + optional actions (`openBead`, `insertCode`, `copy`).
- **Quick actions**: input = bead id; output = JSON rendered to quick pick / notification.
- **Risk scorer**: input = bead metadata only; output = risk JSON.
- **Onboarding**: input = current view + optional error; output = markdown tip.

### Open questions / owners
- Persist model choice per workspace? (owner: Marvin)
- Send file snippets only with per-invocation consent? (owner: PM)
- Risk scorer cadence: manual vs scheduled? (owner: Eng/PM)

## Visual Design: Issue Type Icons

### Icon Selection Rationale

Issue types are differentiated using creative, memorable icons from the VS Code Codicon library. Icons were chosen to be:

- **Distinctive**: Each type has a unique visual identity
- **Intuitive**: Icon meaning maps naturally to the issue type
- **Theme-compatible**: All icons work in both light and dark themes

### Icon Mapping

| Issue Type | Icon | Rationale |
|------------|------|-----------|
| `epic` | `rocket` | Conveys launching toward a big goal/initiative |
| `task` | `tasklist` | Clear work item checklist visual |
| `bug` | `bug` | Universal bug symbol (kept from original) |
| `feature` | `sparkle` | Represents something new and shiny |
| `spike` | `telescope` | Research/exploration - looking ahead |
| `chore` | `wrench` | Tool/maintenance work indicator |

### Icon Color Logic

Icons are colored based on issue status:

- **Open**: Blue (`charts.blue`)
- **In Progress**: Yellow (`charts.yellow`) or Orange (`charts.orange` if stale)
- **Blocked**: Red (`errorForeground`)
- **Closed**: Green checkmark (`pass` icon with `testing.iconPassed`)

Closed issues always show a checkmark (✓) regardless of type.
