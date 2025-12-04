# To Do

- Add feedback so users can submit ideas and suggestions as github issues.
- Remove prefixes from names. Add more detail.
- Activity feed has wrong timestamps. And it doesn't seem to always update. I guess it stops at 100 events?
- Tapping on items in the activity feed fails to open anything

## Worktree audit (2025-12-04)

Findings
- Shared state lives in `.beads/` (SQLite + JSONL, locks, heartbeats). All bd calls in `scripts/task-worktree.sh` flow through `bd_cmd` with `BEADS_NO_DAEMON=1` to avoid daemon + worktree misrouting.
- Claim serialization: `.beads/locks/claim-<task>.lock` (flock/python/mkdir fallback) wraps verify+claim. Merge serialization: `.beads/merge.lock` wraps finish; pre-merge conflict dry-run added.
- Liveness: heartbeats at `.beads/heartbeats/<worker>__<task>.hb` (60s touch, 180s stale). Sweep in `status` reopens stuck tasks and prunes orphaned worktrees.
- Orchestration docs/live tooling: `scripts/task-worktree.sh`, `docs/MULTI_AGENT_ORCHESTRATION.md`, `docs/worktree-guard.md`, `scripts/stress-test.sh` (sandbox stress). VS Code extension currently has no worktree-aware code paths; worktree guard is CLI-only.

Current code paths & owners
- `scripts/task-worktree.sh` (multi-agent workflow, locks/heartbeats/merge queue) — Ops tooling.
- `docs/MULTI_AGENT_ORCHESTRATION.md` / `docs/multi-agent.md` (usage guidance) — Docs.
- `docs/worktree-guard.md` + audit subcommand inside task-worktree.sh — Ops tooling.
- `scripts/stress-test.sh` (sandbox stress harness) — Testing.

Failure matrix (selected)
- Duplicate worktrees for same task (different workers): risk of parallel commits/merges; detected by `task-worktree.sh audit` duplicate check; remediate by cleanup extra worktree and reopen task if needed.
- Task status in_progress but no worktree (crash): causes blocked task; detected by audit and stale heartbeat sweep; remediate with `cleanup <worker>` or manual reopen + prune.
- Heartbeat present but no worktree: stale liveness file can keep task blocked; audit highlights; remediate by deleting hb + reopening task.
- Missing heartbeat for active worktree: no crash detection; ensure start runs heartbeat; restart heartbeat or restart task.
- Merge queue lock left held (stuck finish): agents wait until timeout; remediate by inspecting `.beads/merge.lock` holder and re-running finish.
- Daemon on worktree (bd without BEADS_NO_DAEMON): may commit to wrong branch; enforce `bd_cmd` wrapper or export BEADS_NO_DAEMON=1.

Recommended constraints
- Always use `./scripts/task-worktree.sh start|finish` (never direct git worktree or bd) and keep `BEADS_NO_DAEMON=1`.
- Run `./scripts/task-worktree.sh status` (or `audit`) before claiming/finishing when multiple agents are active.
- Ensure heartbeats directory and locks stay gitignored (`.beads/*.lock`, `.beads/heartbeats/`).
- If a worktree crashes, prefer `cleanup <worker>` to manual deletion so locks/heartbeats are cleared.

Remediation checklist for broken worktrees
- Run `./scripts/task-worktree.sh audit` to see duplicates/missing heartbeats.
- For duplicate worktrees: keep the branch with newest commit, remove others via `cleanup <worker>` and reopen task if claim lost.
- For in_progress without worktree: `bd update <task> --status open --assignee ""` under claim lock (or rely on stale sweep), then prune worktrees (`git worktree prune`).
- For stale heartbeats: delete the hb file and rerun `status` (sweep), or `cleanup` the worker.
- For stuck merge queue: identify process holding `.beads/merge.lock`; if none, remove lock and rerun `finish`.
## Multi-agent & UI testing research (beads-vscode-arh)

### Tooling survey
- VS Code extension UI: @vscode/test-electron (official), Playwright w/ VS Code Server (experimental), vscode-extension-tester (Selenium-based, heavier).
- Ink TUI: ink-testing-library + react-test-renderer for component tests; for end-to-end, use `node-pty` or `expect`/`script` to drive a pseudo-TTY.
- Multi-agent concurrency: bash/node harness spawning task-worktree.sh + bd with temp repos; use file locks + timeouts; collect JSON traces.
- Web (future): Playwright headless Chromium with fixtures; disable by default to keep CI time manageable.

### Deadlock / race mitigations
- File locks: always use per-task and merge locks (already in task-worktree.sh); ensure harness respects lock timeouts and reports wait reasons.
- WAL for sqlite (done) + busy_timeout.
- Heartbeats with stale detection (existing) — harness should simulate missed heartbeats and verify recovery.
- Merge queue serialization (existing) — include in harness scenarios.

### CI considerations
- Headless VS Code via @vscode/test-electron; cache VS Code download to speed runs.
- Use smaller fixture data; cap events/tasks per run to keep under ~3-4 minutes.
- Matrix for different surfaces but allow `TEST_SURFACE` env to select subset.

### Sample commands/config
- VS Code integration: `npm run test:integration` (already set).
- Harness (to build): `npm run test:harness -- --agents 5 --iterations 50 --seed 42` (placeholder; to be implemented in scripts/agent-harness).
- TUI smoke (future): `npm run test:tui:smoke` using pty-based runner.
- Web skeleton (future): `npm run test:web:skeleton` behind env flag.

### Next steps (suggested)
- Implement harness runner in scripts/agent-harness: temp repo, seed tasks, spawn N agents running claim-next/finish loops, export trace JSON, assert no deadlocks.
- Add comparison table to this note (tool vs. pros/cons vs. CI support).

## File size & collision audit (beads-vscode-2ty)

Snapshot: 2025-12-04. LOC from wc -l (excluding node_modules/out); churn = count of commits touching file (`git log --name-only` uniq).

| File | LOC | Churn | Collision risk | Suggested split / owners |
| --- | --- | --- | --- | --- |
| src/extension.ts | 3466 | 45 | Very high (core commands, webviews, hover) | Extract modules: commands/registration, Little Glen webview handlers, activity feed panel, worktree guard wrappers. Owner: VS Code surface. |
| scripts/task-worktree.sh | 1244 | 15 | High (all agents rely on it) | Split into guard/lock lib + start/finish/audit subcommands; add library for JSON output to ease tests. Owner: Ops tooling. |
| src/activityFeedProvider.ts | 669 | 3 | Medium (list rendering + fetch) | Move fetch/normalize to separate service; isolate view model from TreeDataProvider. |
| src/activityFeed.ts | 616 | 2 | Medium | Split formatter utilities vs fetch logic; co-locate tests per slice. |
| src/utils.ts | 419 | 11 | High (shared helpers, sanitizer) | Separate concerns: bead normalization/time in one module; HTML/sanitize helpers in another; linkify in its own file. |
| INTERFACE_DESIGN.md | 359 | 4 | Low (doc) | Keep but move per-feature contracts to dedicated docs/ design files. |
| src/test/unit/utils.test.ts | 556 | 8 | Medium (broad coverage) | Mirror splits from utils to smaller test files. |
| src/test/suite/integration.test.ts | 573 | 4 | Medium | Consider per-surface suites (extension, activity feed). |

Top 5 collision-prone areas (rationale):
1) src/extension.ts — single bucket for commands/webviews; frequent concurrent edits.  
2) scripts/task-worktree.sh — every agent uses start/finish; lock logic risky to touch.  
3) src/utils.ts — mixed helpers (HTML, time, bead parsing) touched by multiple security tasks.  
4) src/activityFeedProvider.ts — tree rendering plus state; any UI tweak collides.  
5) src/test/unit/utils.test.ts — monolithic tests mirroring utils; refactors conflict easily.

Recommended sequencing (reduce merge pain):
1) Split extension.ts into sub-modules (commands.ts, littleGlen.ts, dependencyTree.ts, activityFeedPanel.ts); update imports.  
2) Refactor utils.ts into scoped files and align unit tests accordingly.  
3) Extract task-worktree.sh libraries (lock/guard/fs helpers) and add JSON audit output for tests.  
4) Move activity feed fetch/format into a service and shrink provider.  
5) Restructure tests to mirror new module boundaries (smaller, focused files).

## AI & VS Code APIs (beads-vscode-8ve)

Context (2025-12-04): VS Code 1.104 adds auto model selection and a custom OpenAI-compatible provider in Insiders; Chat Participant API docs refreshed 2025-11-12; GitHub Copilot Extension (server-side) sunsets 2025-11-10 (chat participants not affected).

### Comparison
| Option | UX surface | Engine/version req. | Auth & quotas | Pros | Cons / risks | Go / No-go |
| --- | --- | --- | --- | --- | --- | --- |
| Copilot chat participant (@beads) | Chat + inline chat + agent mode | VS Code >=1.95 stable; Copilot Chat extension (latest); model picker/auto-select in 1.104+ | Copilot subscription or Copilot Free (low quota); subject to Copilot org policies | Deep VS Code API hooks, tool calling, easy Marketplace ship; agent mode can edit multiple files; minimal infra | Paywall; model churn when Auto picks cheaper models; org policies may block; offline impossible | **Go** as primary UX; gate on capability check |
| vscode.lm API with BYO provider | Any command/view; can reuse existing UI | VS Code >=1.102 (LM + MCP); Insiders 1.104+ for custom OpenAI provider | Bring-your-own key (OpenAI/Azure/Gemini/Ollama); you own rate limits | Works without Copilot; supports local/offline via Ollama; lets us pick cheapest/allowed models | More UX work (no chat UI out of box); need our own backoff/quota handling; model list may be empty | **Go** as fallback/offline |
| Copilot agent mode only (no participant) | Agent sidebar only | Copilot Chat ext; VS Code >=1.104 | Copilot subscription | Zero build effort; good for internal dogfood | No Beads-specific tools/prompts; opaque edits; hard to validate actions | **No-go** for users; OK for internal use |

### Recommendation
- Ship a Copilot chat participant (@beads) for guided Beads flows (search, update, guard remediation). Detect Copilot availability; show friendly error when blocked.
- Offer optional BYO provider path via `vscode.lm` with OpenAI-compatible endpoint or Ollama for offline/local scenarios.
- Keep UI lean (chat + quick fixes); avoid new webviews until Little Glen hardening lands.

### Minimum versions & prerequisites
- VS Code: target 1.104+ (auto model selection, custom provider plumbing).
- Copilot Chat extension: latest; Copilot subscription recommended for full quotas/models.
- Fallback: OpenAI-compatible endpoint or Ollama with tool-calling model for agent-like actions.

### Risks & mitigations
- Model churn/quotas: implement `selectChatModels` with vendor/family filters; retry/backoff and surface “model unavailable” toast instead of stack traces.
- Policy/paywall: if no Copilot models, prompt to configure BYO provider or use offline mode.
- Data controls: respect workspace trust; never send file content without explicit consent; prefer partial snippets.
- API instability (LM picker churn around 1.103–1.104): wrap LM calls in try/catch and fall back to palette commands.

### Go / No-go call
- Copilot participant: **GO** (primary).
- Pure `vscode.lm` path: **GO** (fallback/offline).
- Server-side Copilot Extension (GitHub App): **NO-GO** (sunset 2025-11-10).

## Ink TUI & worktree research (beads-vscode-op4)

### Toolkit comparison
| Stack | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Ink v4 | React mental model, hooks, flexbox-ish layout, good TypeScript; community widgets (select, text input), reconciler handles stdout quirks | Focus management manual; needs `ink-testing-library` for tests; reflow cost with huge lists | **Chosen** |
| blessed / neo-blessed | Mature, low-level, rich widgets, fast rendering | Callback-heavy API, less TS, brittle styling; harder composition | Skip |
| term-kit / inkjet | Lightweight rendering abstractions | Small ecosystem, fewer widgets, docs sparse | Skip |

### Worktree detection & guard hooks
- Primary: `git worktree list --porcelain` + match cwd prefix (already in `src/worktree.ts` / `tui/src/lib/worktree.ts`); fallback to env `BEADS_WORKTREE_ID`.
- Badge: `worktreeLabel(cwd)` → `wt:<worker/task>` displayed in status bar and list headers.
- Guard: wrap mutating commands with `guardAndRun(cwd, action)` that shells `scripts/worktree-guard.sh`; bubble errors to a toast: “Worktree guard blocked action—run ./scripts/task-worktree.sh status”.

### Focus/keymap strategy (Ink)
- Use a central focus ring (array of focusable ids) with hotkeys: `tab`/`shift+tab` to cycle, `j/k` to move lists, `/` to focus filter input, `g/G` to jump top/bottom. Keep global key listener in app root; pass focused id via context.
- List virtualization: prefer windowing for >200 rows to avoid reflow stalls; keep per-row keys stable (issue id + worktree).

### Graph/rendering libs for CLI
- Text charts: `asciichart` for sparkline-style burnups; `cli-boxes` for framed panels; `cli-spinners` for async states; `chalk` for color (already in deps).
- Optional: `ink-big-text` for hero headers; `ansi-escapes` for cursor save/restore during guard prompts.
- Input widgets: `ink-select-input`, `ink-multi-select`, `ink-text-input` cover core needs; wrap them to inject worktree badge per item.

### Risks / open questions
- Focus drift when panels mount/unmount; mitigate with focus ring + restoring last focused id per view.
- Guard latency: shelling to `worktree-guard.sh` on every mutation may add ~50–150ms; cache “last ok” per worktree for N seconds while keeping explicit hook for force refresh.
- Multi-worktree concurrency: need dedupe of activity rows by `(worktreeId,id,timestamp)` to avoid double rendering (helper added in `tui/src/lib/worktree.ts`).
- Accessibility: screen reader coverage for Ink is limited; keep keymaps discoverable in help modal.
## Ink TUI parity thoughts (beads-vscode-1u7)

- Surfaces to align: list/search/sort, detail view, edit/update, dependency graph, stale/risk badges, worktree badges.
- Worktree integration: show badge in status bar and list header; guard before mutations via shared wrapper (needs TUI hook).
- Navigation/keymaps: map core actions to shortcuts; ensure focus management for pty-based runs.
- Testing: ink-testing-library for component unit tests; pseudo-tty smoke via `script` or `expect` for end-to-end.
- Next steps: scaffold TUI worktree helper mirroring VS Code one; add status bar badge; wire guard into create/update/delete commands.

## Modularization rollout (Dec 2025)
- Run `npm run check:size` before PRs; fails if any src/** or tui/src/** file exceeds 320 lines.
- Rebase existing branches after path alias/layout changes; resolve module path errors by updating imports.
- If rollout causes churn: revert merge commit, disable check by removing script from CI, and communicate new file caps.
