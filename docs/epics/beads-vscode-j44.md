# Epic: Modularize code for multi-agent work (beads-vscode-j44)

## Goal
Refactor the extension into smaller, domain-focused modules to reduce merge conflicts and clarify ownership, with no core file > ~300 lines.

## Current pain points
- `extension.ts` is large and covers tree provider, commands, webviews.
- Shared utils are mixed; worktree logic is separate but could be a module.
- Tests mostly in unit/integration without clear module boundaries.

## Proposed module slices
1) Providers / views
- Split `extension.ts` into `providers/` (tree, activity feed) and `commands/` (create/update/delete, visualization).
- Barrel exports per domain.

2) Worktree/guard shared module
- Move worktree helpers, guard invocation wrapper into `worktree/` module reused by CLI wrappers and extension.

3) Testing structure
- Mirror src layout in tests; add module-level test entrypoints.

4) Build/paths
- Update tsconfig path aliases to new module folders; adjust imports.

## Acceptance alignment
- No core file >300 lines: target split of extension.ts into 3–4 files.
- Clear directories: `src/providers`, `src/commands`, `src/worktree`, `src/ai` (stub), `src/activity` etc.
- Minimize conflicts: document boundaries and ownership in README/CONTRIBUTING or a short `docs/architecture-modularity.md`.

## Next steps
- [ ] Draft folder layout and tsconfig path aliases.
- [ ] Identify top 3 largest files (extension.ts, activityFeedProvider.ts, utils?) and propose splits.
- [ ] Add architecture note with boundaries and ownership to guide future PRs.
