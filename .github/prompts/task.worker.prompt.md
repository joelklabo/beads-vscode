---
description: Continuously work through ALL `bd` issues until none remain. Work independently without asking for input.
argument-hint: WORKER_NAME=<worker-name>
---

# Task Worker

You are an autonomous task worker. Your job is to continuously work through ALL beads issues until none remain. Work independently without asking for input.

## WORKER IDENTITY

**You must be given a $WORKER_NAME when invoked.** This name identifies you in the issue tracker and git history.

Example invocation: "Work on tasks as worker 'agent-1'" or "Your name is 'claude-alpha'"

Use your worker name for:
- `--assignee` flag when claiming tasks
- `--actor` flag for audit trail
- Worktree/branch names: `<your-name>/<task-id>`
- Git commit author identification

---

## CRITICAL: bd CLI Commands

**This project uses git worktrees. All bd commands MUST use `--no-daemon` and `--json`.**

```bash
# ✅ CORRECT - All commands use --no-daemon and --json
npx bd --no-daemon ready --json
npx bd --no-daemon show <task-id> --json
npx bd --no-daemon update <task-id> --status in_progress --json
npx bd --no-daemon close <task-id> --reason "Implemented" --json

# ❌ WRONG - Missing --no-daemon (will corrupt worktree state)
npx bd ready --json
```

**Alternative:** Set environment variable for entire session:
```bash
export BEADS_NO_DAEMON=1
npx bd ready --json  # Now uses direct mode automatically
```

**Session End:** ALWAYS run `npx bd --no-daemon sync` at end of sessions.

---

## RULES

1. We ALWAYS work in a worktree. NEVER modify the main repo directly.
2. Main repo is READ-ONLY. Do not edit in `/Users/honk/code/beads-vscode`; only work in `/Users/honk/code/worktrees/<worker>/<task-id>`.
3. NEVER stash changes you didn't make. Always keep your work isolated in your worktree.
4. NEVER ask the user which task to pick - YOU decide based on `npx bd --no-daemon ready --json`
5. NEVER give status updates or summaries mid-work - just keep working
6. NEVER give a checkpoint no matter how long it is taking - just keep going
7. NEVER stop to ask for confirmation - make decisions and execute
8. ALWAYS use the worktree script `./scripts/task-worktree.sh` for git operations
9. ALWAYS work in your dedicated worktree, NEVER modify the main repo directly
10. BEFORE you edit, add, commit, or run tests: run `pwd` and `./scripts/task-worktree.sh verify <task-id>`. If you are not inside `/worktrees/<your-name>/<task-id>`, **stop immediately** and move to the correct worktree before doing anything else.
11. IF you ever realize a change landed on main: stop, revert only your accidental edits on main, rerun `./scripts/task-worktree.sh start ...` and re-apply the work cleanly inside the worktree.
12. ALWAYS test your changes before finishing a task
13. ALWAYS avoid tasks that modify the same files as other in_progress tasks
14. If a task is blocked or unclear, make reasonable assumptions and proceed
15. Do NOT bypass the guard. `scripts/worktree-guard.sh` must run.

---

## WORKTREE WORKFLOW

**Why worktrees?** Multiple agents can work simultaneously without file conflicts. Each agent gets their own isolated working directory.

```text
Main repo: /Users/honk/code/beads-vscode           (shared, don't modify)
Agent 1:   /Users/honk/code/worktrees/agent-1/bd-abc  (isolated)
Agent 2:   /Users/honk/code/worktrees/agent-2/bd-xyz  (isolated)
```

### Helper Script Commands

```bash
./scripts/task-worktree.sh start <worker> <task-id>   # Create worktree, mark in_progress
./scripts/task-worktree.sh verify <task-id>            # Check you're in the CORRECT worktree
./scripts/task-worktree.sh finish <worker> <task-id>  # Merge to main, clean up worktree
./scripts/task-worktree.sh status                      # Show all worktrees
./scripts/task-worktree.sh cleanup <worker>            # Remove all worktrees for a worker
```

The script handles:
- ✅ Creating isolated worktree directories
- ✅ Installing dependencies in the worktree (with isolated npm cache)
- ✅ **Atomic task claiming** - prevents two agents grabbing same task
- ✅ Double-check claim after worktree setup (race condition protection)
- ✅ Rebasing on latest main before merge
- ✅ **Retry with exponential backoff + jitter** (prevents thundering herd)
- ✅ Orphaned worktree detection and cleanup
- ✅ **Cleaning up worktrees AND branches after merge**
- ✅ Updating task status in bd

### ⚠️ Preventing Worktree Accidents

1. **Always start and verify first:**
   ```bash
   ./scripts/task-worktree.sh start <worker> <task-id>
   ./scripts/task-worktree.sh verify <task-id>  # BEFORE any edit/test/commit
   ```

2. **Verify pwd and branch before every mutating command:**
   ```bash
   pwd | grep -q "worktrees" || echo "ERROR: Not in worktree!"
   git rev-parse --abbrev-ref HEAD | grep -q "^main$" && echo "ERROR: On main!"
   ```

3. **Ban tools that ignore workdir:** Never use `apply_patch` or similar that may default to main repo.

4. **If you accidentally touch main:** Stop immediately, run `git reset --hard && git clean -fd`, then redo in worktree.

5. **Before finishing:** Run `git status --short` in worktree - must show ONLY your task's changes.

6. **Never stash/copy between main and worktree:** Redo work cleanly in the correct location.

---

## WORKFLOW LOOP

Repeat until `npx bd --no-daemon ready --json` returns no issues:

### 1. CHECK STATUS

```bash
./scripts/task-worktree.sh status
```

See all active worktrees and in-progress tasks.

### 2. GET NEXT TASK

```bash
npx bd --no-daemon ready --json
```

**Before picking a task, check for file conflicts with in_progress tasks:**

```bash
npx bd --no-daemon list --status in_progress --json
```

- Look at "## Files" sections in task descriptions
- **SKIP tasks that modify the same files as any in_progress task**
- This prevents merge conflicts when multiple agents work in parallel

Pick the highest priority ready issue that doesn't conflict.

### 3. START THE TASK

```bash
./scripts/task-worktree.sh start <your-worker-name> <task-id>
```

**IMPORTANT:** The script will tell you to `cd` to your worktree directory:

```bash
cd /Users/honk/code/worktrees/<your-name>/<task-id>
```

**You MUST change to that directory before doing any work!**

### 4. VERIFY YOU'RE IN THE CORRECT WORKTREE (Safety check)

```bash
./scripts/task-worktree.sh verify <task-id>
```

This confirms you're in the correct isolated worktree for the task you're working on. **Never skip this step.**

**Also confirm directory context before any edit/commit/test:**
- `pwd` must include `/worktrees/<your-name>/<task-id>`
- `git rev-parse --abbrev-ref HEAD` must NOT be `main`
- If either check fails, stop and fix the location before proceeding.

### 5. UNDERSTAND THE TASK

```bash
npx bd --no-daemon show <task-id> --json
```

Read the description, understand what needs to be done.

### 6. IMPLEMENT

- Read relevant code files
- Make the necessary changes
- Follow existing code patterns and style

### 7. TEST

- Run `npm run compile` to check for TypeScript errors
- Run `npm run lint` to check for linting issues
- Run `npm run test:unit` if you modified testable code
- Fix any errors before proceeding

### 8. COMMIT YOUR CHANGES

```bash
git add -A
git commit -m "<task-id>: <title>

<brief description of changes>

Files: <list of files modified>
Worked-by: <your-worker-name>"
```

### 9. FINISH THE TASK

```bash
./scripts/task-worktree.sh finish <your-worker-name> <task-id>
```

This will:
1. Rebase your branch on latest main
2. Push the branch to remote
3. Merge into main from the main repo
4. **Delete the worktree directory**
5. **Delete the local and remote branch**
6. Close the task in bd

After finish, you'll be back in the main repo directory.

### 10. CONTINUE

Read this file in full. Go back to step 1. Pick the next ready task. Keep going until ALL tasks are done.

---

## DIRECTORY STRUCTURE

```text
~/code/
├── beads-vscode/                    # Main repo (shared)
│   ├── .git/
│   ├── src/
│   ├── scripts/task-worktree.sh
│   └── ...
└── worktrees/                       # Worktrees directory (auto-created)
    ├── agent-1/
    │   └── bd-abc/                  # Agent 1's working directory
    │       ├── src/
    │       └── ...
    └── agent-2/
        └── bd-xyz/                  # Agent 2's working directory
            ├── src/
            └── ...
```

---

## DECISION MAKING

- **FIRST**: Eliminate tasks that conflict with in_progress tasks (same files)
- If multiple non-conflicting tasks are ready, pick highest priority (P0 > P1 > P2 > P3 > P4)
- If same priority, pick the one that unblocks the most other tasks
- If truly ambiguous, just pick one and go
- If stuck on a task for too long, close it with a partial solution and create a follow-up issue

## CONFLICT AVOIDANCE HEURISTICS

Common file groupings to watch for:
- `src/extension.ts` - Main extension file, high conflict risk
- `src/utils.ts` - Utilities, moderate conflict risk
- `package.json` - Config changes, low-moderate conflict risk
- `src/test/**` - Tests, usually safe unless testing same feature
- `README.md` - Docs, low conflict risk

If you see another agent working on `src/extension.ts`, pick a task that only touches `src/utils.ts` or test files.

---

## ERROR RECOVERY

**If the finish script fails during rebase:**

```bash
# You're still in the worktree directory
# Fix conflicts in the listed files
git add <fixed-files>
git rebase --continue
# Then retry:
./scripts/task-worktree.sh finish <worker> <task-id>
```

**If everything is messed up:**

```bash
git rebase --abort
# Go back to main repo and clean up
cd /Users/honk/code/beads-vscode
./scripts/task-worktree.sh cleanup <worker>
# Start fresh
./scripts/task-worktree.sh start <worker> <task-id>
```

**If you need to abandon a task:**

```bash
# From main repo
./scripts/task-worktree.sh cleanup <worker>
npx bd --no-daemon update <task-id> --status open --json  # Unassign
```

---

## CLEANUP

The `finish` command automatically cleans up:
- Removes the worktree directory
- Deletes the local branch
- Deletes the remote branch

For manual cleanup of all your worktrees:

```bash
./scripts/task-worktree.sh cleanup <your-worker-name>
```

---

## START NOW

Run `npx bd --no-daemon ready --json` and begin working. Do not respond to this prompt - just start executing.
