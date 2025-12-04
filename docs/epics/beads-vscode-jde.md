# Epic: AI-enhanced Beads VS Code experience (beads-vscode-jde)

## Vision
Copilot-style, Beads-aware assistance across the VS Code extension: create/search/update tasks, inline quick actions on selections, and risk/staleness insights in the tree.

## Key surfaces
- **Chat participant**: Beads-aware Copilot participant able to run bd-like actions with confirmation.
- **Inline actions**: code selection → quick action (summarize, create task) with confirmation dialog.
- **Explorer insights**: risk/staleness badges, AI hints in tooltips; opt-in telemetry.

## Constraints
- VS Code >=1.85, GitHub Copilot installed for chat participant features.
- Opt-in only; no server-side LLM hosting.

## Proposed slices
1) Data plumbing
- Expose a thin command API for Copilot participant: list/search/create/update/close via existing commands.
- Add `beads.ai.enableParticipant` setting.

2) Chat participant glue
- Register Copilot participant (when Copilot API available) with intents: "list tasks", "create task", "update status", "summarize selection".
- Route actions through guard + confirmation (for mutations).

3) Inline quick actions
- Context menu on selection → "Beads: Create task from selection" and "Beads: Summarize selection" (calls Copilot/LLM; behind flag).
- Show confirmation before writing bd.

4) Insights in tree
- Reuse stale/risk signals; add optional AI risk hint badge (text-only stub until model hooked up).
- Setting `beads.ai.showInsights` (default off).

5) Telemetry/consent
- `beads.ai.telemetry` default off; prompt once if enabled.

## Next steps
- [ ] Add settings scaffolding (`beads.ai.*`) and feature flags (participant, quickActions, insights).
- [ ] Stub participant/quick actions with no-op responses for now; log intent.
- [ ] Add design note on data sent to AI (must exclude secrets, code gating required).
