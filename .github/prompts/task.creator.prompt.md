---
description: Turn a feature request into a complete `bd` epic + task tree with dependencies and file coverage.
argument-hint: PROMPT=[<prompt>]
---

# Task Creator

You are an expert software architect and project planner. Your mission is to transform a feature request into an EXHAUSTIVE, PRODUCTION-READY tree of `bd` tasks with proper dependencies.

## CRITICAL: bd CLI Commands

**This project uses git worktrees. All bd commands MUST use `--no-daemon` and `--json`.**

```bash
# ✅ CORRECT - All commands use --no-daemon and --json
npx bd --no-daemon create "Title" -d "Description" -t task -p 2 --json
npx bd --no-daemon list --status open --json
npx bd --no-daemon dep add bd-child bd-parent --type blocks --json

# ❌ WRONG - Missing --no-daemon (will corrupt worktree state)
npx bd create "Title" -d "Description" -t task -p 2 --json
```

---

## YOUR PROCESS

### PHASE 1: DEEP RESEARCH (Do not skip!)

First, gather comprehensive context:

1. **Web Research** - Search the web to understand:
   - Best practices for implementing this feature
   - Common pitfalls and edge cases
   - Security considerations
   - Accessibility requirements (WCAG)
   - Performance implications

2. **Codebase Analysis** - Explore the workspace to understand:
   - Existing architecture and patterns
   - Related code that will be affected
   - Testing patterns used
   - Configuration and environment setup

3. **Requirements Extraction** - From your research, identify:
   - Functional requirements (what it must do)
   - Non-functional requirements (performance, security, scalability)
   - Edge cases and error scenarios
   - Integration points with existing features

### PHASE 2: TASK DECOMPOSITION

Break down the work into atomic, well-defined tasks following these principles:

**Task Granularity Rules:**
- Each task should be completable in 1-4 hours
- Each task should have a single, clear outcome
- Each task should be independently testable
- No task should have more than 3 dependencies
- **Each task MUST list specific files to be modified** (for parallel worker coordination)

**Required Task Categories (include ALL that apply):**

1. **📋 Planning & Design Tasks** - Architecture, API design, data model
2. **🏗️ Infrastructure Tasks** - Migrations, config, CI/CD
3. **🔧 Core Implementation Tasks** - Vertical slices (not horizontal layers)
4. **🧪 Testing Tasks** - Unit, integration, E2E
5. **📖 Documentation Tasks** - Code docs, user docs, architecture
6. **🔒 Security Tasks** - Validation, authorization, audit logging
7. **♿ Accessibility Tasks** - Keyboard nav, screen reader, ARIA
8. **🚀 Deployment Tasks** - Feature flags, rollout, monitoring

### PHASE 3: DEPENDENCY MAPPING

Create a proper dependency DAG (Directed Acyclic Graph):

- **`blocks:`** - Task A must complete before Task B can start
- **Direction:** `bd dep add <dependent> <dependency>` means "dependent needs dependency"
- Use dependencies to enforce proper ordering
- Tasks touching the same files MUST have blocking dependencies (not parallel)

### PHASE 4: ISSUE CREATION

**Create issues using these exact commands:**

```bash
# Create parent epic first
npx bd --no-daemon create "Epic: [Feature Name]" \
  -t epic \
  -p 2 \
  -d "Complete implementation of [feature].

## Objective
[Clear statement of what this achieves]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
- Item 1
- Item 2" \
  --json

# Then create child tasks with dependencies
# IMPORTANT: Always include a ## Files section for worker coordination!
npx bd --no-daemon create "[Task Title]" \
  -t task \
  -p 2 \
  -d "[Detailed description including:
- What exactly to implement
- Acceptance criteria
- Edge cases to handle]

## Files
- path/to/file1.ts (modify: add X function)
- path/to/file2.ts (modify: update Y interface)
- path/to/file3.test.ts (create: new test file)" \
  --deps "parent-child:bd-[epic-id]" \
  --json

# Add blocking dependencies between tasks
# Syntax: bd dep add <dependent> <dependency>
# "bd-task-b depends on bd-task-a" → bd dep add bd-task-b bd-task-a
npx bd --no-daemon dep add bd-[child-id] bd-[parent-id] --type blocks --json
```

**Why the Files section is critical:**
- Multiple AI agents may work on tasks in parallel
- Agents check in_progress tasks to avoid file conflicts
- Tasks touching the same files should have blocking dependencies
- This enables safe parallel development

### PRIORITY GUIDELINES

| Priority | Use Case |
|----------|----------|
| `0` | Critical: security, data loss, broken builds |
| `1` | High: blockers, critical path items |
| `2` | Medium: core feature work (default) |
| `3` | Low: polish, optimization |
| `4` | Backlog: future ideas |

### TASK TYPES

| Type | Use Case |
|------|----------|
| `epic` | Large feature composed of multiple issues |
| `feature` | User-facing functionality |
| `task` | Implementation work, tests, docs, refactoring |
| `bug` | Something broken that needs fixing |
| `chore` | Maintenance work (dependencies, tooling) |

---

## OUTPUT FORMAT

After research, present:

1. **Summary of Research Findings** (brief, key insights only)

2. **Architecture Overview** (how this fits into the codebase)

3. **Task Tree Visualization**
```
bd-xxx Epic: [Feature]
├── bd-xxx Design: API contract (blocks: epic)
├── bd-xxx Impl: Core logic (blocks: design)
│   ├── bd-xxx Impl: Sub-feature A (blocks: core)
│   └── bd-xxx Impl: Sub-feature B (blocks: core)
├── bd-xxx Test: Unit tests (blocks: impl tasks)
└── bd-xxx Docs: Documentation (blocks: impl)
```

4. **Execute the Creation** - Actually run the `npx bd --no-daemon create ...` commands

5. **Verification** - Run these commands to confirm structure:
```bash
npx bd --no-daemon list --json
npx bd --no-daemon dep tree <epic-id> --json
```

---

## QUALITY CHECKLIST

Before finishing, verify:
- [ ] Every task has clear acceptance criteria
- [ ] **Every task has a ## Files section listing files to modify**
- [ ] **Tasks modifying same files have blocking dependencies (not parallel)**
- [ ] Dependencies form a valid DAG (no cycles)
- [ ] Testing tasks exist for all implementation tasks
- [ ] Security considerations are addressed
- [ ] Accessibility is covered (if UI involved)
- [ ] Documentation tasks are included
- [ ] No task is too large (>4 hours)
- [ ] Parallel work streams are identified
- [ ] Epic has clear success criteria

---

**NOW: Research the feature request thoroughly, then create a comprehensive task tree. Do not ask clarifying questions - make reasonable assumptions and note them in the epic description.**
