# ADR: Activation, lifecycle, and size/performance budgets

- Status: Accepted
- Date: 2025-12-10
- Owner: codex-beta
- Related issues: beads-r2t (epic), beads-gjt (this ADR), beads-8ec (perf harness), beads-9mf (lazy activation), beads-e38/beads-tgz (CSP hardening), beads-bfo (CLI guardrails), beads-3cb (activity feed resilience), beads-ays (prepublish gates)

## Context
- The extension still activates eagerly (empty activationEvents) and constructs providers/watchers on load, creating startup cost and redundant listeners in multi-root windows.
- Webviews (issues + graph) ship with permissive CSP (unsafe-inline/eval) and inline scripts, increasing XSS/extension-host risk.
- Bundle/VSIX size is unchecked; prior esbuild output measured ~0.8 MB but VSIX audits are optional and not enforced in prepublish.
- Activity feed shells out to `sqlite3`, which fails on remote SSH/locked DBs, surfacing noisy errors.
- CLI mutations rely on guard/trust hooks but lack a documented policy for retries, timeouts, and concurrency ordering.

## Decision
1. **Activation & lifecycle budget**
   - Declare explicit activationEvents (commands/views/chat participants only); no `*` or onStartupFinished.
   - Cold activation target **≤100ms** wall clock on sample repo, measured by `scripts/perf/measure-activation.ts` via @vscode/test-electron.
   - Defer provider/watch creation until first Beady interaction (view reveal or command). Initial data refresh runs after view ready; background refresh is opt-in and debounced per workspace.
   - Multi-root: only the selected workspace instantiates watchers; switching workspace reuses a single lifecycle instance and disposes the prior one.
2. **Size budgets**
   - VSIX zipped **≤3.0 MB** enforced by `scripts/check-vsix-size.js` in prepublish/CI.
   - Bundled `dist/extension.js` **≤1.5 MB** enforced by `scripts/audit-bundle.js` (dynamic requires/externals already checked).
   - Webview bundles (issues/graph) each **≤1.2 MB**; warn at 1.0 MB, fail at 1.2 MB when adding bundle audit for views.
3. **Webview CSP & messaging**
   - CSP: `default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src ${webview.cspSource};` no `unsafe-inline/eval`.
   - All inline scripts/handlers are removed; per-render nonces applied to every script/style tag.
   - Messages from webviews are schema-validated before use; unknown commands are ignored with a warning only.
4. **CLI mutation policy**
   - Every mutating bd invocation goes through `cliService.runBdCommand` with: workspace trust gate; worktree guard; args sanitized (reject newline/blank); retries=1; timeout=15s; offline threshold=30s; per-workspace **serial queue** to prevent overlapping mutations.
   - Error surfaces are sanitized of workspace paths/worktree ids.
5. **Activity feed resilience**
   - Detect sqlite availability; if missing/remote/locked, disable polling and show an idle/friendly banner instead of throwing.
   - Cap feed query execution to 5s and back off exponentially on failures.
   - Provide a config toggle to force-disable the feed in constrained environments.
6. **Enforcement hooks**
   - `npm run check:perf` (activation harness) and `npm run audit:bundle && npm run check:size` run in `vscode:prepublish` and `ci:verify`; failures block packaging.
   - CSP regression tests cover issues + graph webviews for nonce + no inline/eval.

## Rationale
- Explicit budgets keep activation snappy in the extension host and create guardrails for future features.
- Strong CSP and schema validation mitigate XSS in webviews where user content (titles/descriptions) is rendered.
- Serializing bd mutations prevents corrupt `.beads` state when multiple commands fire concurrently.
- Remote/locked sqlite is common in SSH/Dev Containers; graceful degradation avoids noisy host errors.

## Consequences
- Engineers must keep new features within the budgets or raise them intentionally via ADR update.
- Prepublish/CI will fail on size or perf regressions; developers should run `npm run audit:bundle` and `npm run check:perf` locally before packaging.
- Webview work now requires nonce plumbing and `asWebviewUri` resource mapping.
- Mutation throughput is bounded by the per-workspace queue; long-running bd calls will block later writes (acceptable for safety).

## Follow-ups
- Add bundle audit entries for webview JS/CSS outputs to enforce the 1.2 MB ceilings.
- Wire `check:perf` and size audits into `ci:verify` and `vscode:prepublish` (beads-ays).
- Implement the activation harness, CSP refactors, mutation queue, and feed fallbacks in their respective tasks.
