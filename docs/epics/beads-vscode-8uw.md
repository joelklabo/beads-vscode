# Epic: Old Planner (beads-vscode-8uw)

## Goal
Ship a resilient, file-backed planning surface (“Old Planner”) that multiple agents can edit safely, with deterministic artifacts and low merge collision risk.

## Principles
- Plans are files (small, modular) with ownership metadata.
- Planner layers atop bd tasks; bd remains source of truth for issues.
- Worktree-aware: planner actions include worktree label; guard before writes.

## Proposed structure
- `planner/` directory with per-plan files (e.g., `plans/<area>/<plan>.json` or `.yaml`).
- Schema: metadata (owner, worktree, updatedAt), goals, tasks references (ids), notes, status.
- CLI/VS Code/TUI share a small `planner-core` module for parsing/validating.

## Slices
1) Schema + validation
- Define JSON schema for plan files; add validator utility.
- Add sample plan files as fixtures.

2) CLI hooks
- Add npm script `planner:validate` to check all plan files; optionally a `planner:new` helper.

3) VS Code view stub
- Add explorer node “Planner” listing plan files; open file on click (no edits yet).

4) TUI stub
- List plans and open file view; no edits yet.

5) Concurrency safety
- Encourage one-plan-per-area; small files; guard uses git merge-friendly structure (arrays sorted, stable keys).

## Next steps
- [ ] Draft schema + sample plan under `plans/sample-plan.json`.
- [ ] Validator script (Node) invoked by `npm run planner:validate`.
- [ ] Add README section describing planner layout and constraints.
