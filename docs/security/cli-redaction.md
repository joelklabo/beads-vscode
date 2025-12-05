# CLI Redaction & Trust Guard (summary)

## Threat model
- bd CLI stderr/stdout can leak workspace paths, worktree ids, and tokens when surfaced in UI logs.
- Untrusted VS Code workspaces should not be allowed to mutate issues.

## Mitigations
- `packages/core` exports `redactLogContent` and `sanitizeCliOutput`, applied to every bd invocation to scrub tokens, emails, absolute paths, workspace roots, and worktree identifiers.
- All bd CLI calls are routed through `BdCliClient` which injects `--no-daemon` and rejects newline injection in args.
- VS Code commands now gate mutations on workspace trust; TUI exposes `runGuardedBd` that runs the shared worktree guard before mutating.

## Usage
- Call `sanitizeCliOutput(raw, { workspacePaths, worktreeId })` before surfacing errors.
- Use `runGuardedBd({ args, cwd })` in the TUI for any bd write operation.
- Keep workspace root paths in `workspacePaths` so path redaction can blank them to `<workspace>`.
