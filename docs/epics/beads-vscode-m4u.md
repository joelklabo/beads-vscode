# Epic: Zork interactive guide (beads-vscode-m4u)

## Concept
A text-adventure-style guide (“Zork”) that walks users through Beads workflows in VS Code and Ink TUI with scripted decision trees, validations, and worktree-aware hints.

## Scope
- VS Code + TUI entrypoints to launch Zork.
- Authored scripts (no AI generation) for common flows: setup, create/search/edit, resolve guard errors.
- Validations: check bd/guard outputs; branch based on success/failure.
- Optional flag to enable (default off).

## Building blocks
- Script engine (JSON/YAML) with steps: prompt → command → expect → branch.
- Renderer adapters: VS Code webview/quick pick; Ink TUI screens.
- Worktree context: show current worktree, include in prompts, warn on mismatches.

## Proposed slices
1) Engine skeleton
- Define script schema; parser + executor with stub actions (log only).
- CLI hook to run a script headlessly for testing.

2) VS Code launcher
- Command `beads.zork.start` -> quick pick scripts; render steps via quick pick/input boxes; show progress.

3) TUI launcher
- TUI command palette entry to start a script; render steps in Ink components.

4) Validations & guard integration
- Actions: run guard, run bd command, check file exists, check status.
- Failure handling: show remediation text, allow retry/abort.

5) Docs/tests
- `docs/zork/` with script examples and authoring guide.
- Unit tests for parser/executor; smoke test that a sample script runs end-to-end in VS Code headless.

## Next steps
- [ ] Draft script schema and a sample script under `docs/zork/examples/`.
- [ ] Add feature flag settings `beads.zork.enabled` (default false) and `beads.zork.scriptsPath`.
- [ ] Stub executor with logging so integration tests can start scaffolding.
