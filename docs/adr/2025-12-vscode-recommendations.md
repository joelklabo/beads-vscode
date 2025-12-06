# ADR: VS Code recommendations for bd/.beads projects

- Status: Proposed
- Date: 2025-12-06
- Owner: dontstop
- Related issues: beads-d6q (epic), beads-lwl (this ADR), beads-wwf (metadata), beads-usx (generator), beads-u8n (tests), beads-91e (docs)

## Context
- Teams using the bd CLI typically commit a `.beads/` directory to their repo, but developers opening the workspace in VS Code are not currently prompted to install the Beady extension.
- VS Code has two main mechanisms to surface an extension: Marketplace search relevance (keywords/description) and workspace recommendations stored in `.vscode/extensions.json`.
- We must avoid silently modifying user settings and keep the flow multi-root friendly while respecting worktree guard/`--no-daemon` practices.

## Decision
1) **Marketplace discoverability**: add targeted keywords (e.g., `bd`, `beads`, `worktree`, `dependency graph`, `project manager`) and concise description text in `package.json` to rank for bd-related searches without changing activation events.
2) **Workspace recommendation file**: provide an opt-in script (`npm run recommend:add`) that detects a `.beads/` directory in the chosen workspace root and creates/merges `.vscode/extensions.json` to include the Beady extension ID `4UtopiaInc.beady`.
   - Idempotent merge: preserve existing `recommendations` / `unwantedRecommendations`, avoid duplicates, keep formatting stable.
   - Safety: abort with a clear message when `.beads/` is absent; never edits global user settings.
   - Multi-root: allow overriding the target root via arg/env so only the intended folder is touched.
3) **Template & docs**: document the recommended `.vscode/extensions.json` snippet and instruct bd users to commit it alongside `.beads/`. Provide troubleshooting notes for remote/insiders and workspaces with policy blocks on recommendations.

## Alternatives considered
- Auto-writing recommendations during extension activation or bd CLI runs: rejected to avoid silent repo churn and respect workspace trust/policy controls.
- Publishing a separate “bd helper” extension solely for recommendations: unnecessary overhead; manifest keywords + workspace file cover the need.

## Consequences
- Developers opening bd-enabled repos will see Beady in the VS Code recommendation prompt once the workspace file is added, improving adoption with minimal friction.
- Repos remain opt-in; no user-level settings are modified, and multi-root setups can scope recommendations per folder.

## Open questions / follow-ups
- Validate recommendation prompts in remote contexts (Codespaces/SSH) and note any host-specific limitations in docs.
- Re-evaluate keywords after Marketplace telemetry (if available) to tune search relevance.
