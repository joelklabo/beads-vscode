# TUI visual testing design

## Goals
- Catch layout/regression bugs in the Ink TUI via deterministic text and image snapshots.
- Allow scripted keyboard interactions to reproduce flows and capture final frames.
- Keep runs hermetic (no network/bd calls by default) and portable across macOS/Linux/Windows + CI.
- Support developer-friendly review: HTML report with before/after/diff; easy approve flow.

## Non-goals
- Changing TUI UX itself.
- Visual testing for VS Code or web surfaces.
- Recording live audio/video beyond PNG/text snapshots.

## Requirements
- Determinism: fixed cols/rows (default 80x24, overridable), `TERM=xterm-256color`, `TZ=UTC`, seeded random, stable font.
- Hermetic data: uses mock BeadsStore/workspaces fixtures; no bd invocations unless explicitly enabled.
- Timeouts and crash detection for hung TUIs.
- Redaction: strip tokens/paths/emails from snapshots and reports.
- Accessibility: HTML report must be keyboard navigable, have alt text, and honor high-contrast colors.
- Update flow: `--update` mode refreshes baselines; regular mode fails on diff and writes artifacts to `tmp/tui-visual-report/`.

## Options considered
1) **node-pty + @xterm/headless + pixelmatch (chosen)**
   - Pros: pure JS, works on all CI OS targets; deterministic headless rendering; easy ANSI replay; no external binaries.
   - Cons: need to bundle/select a font for PNGs; must manage pseudo-tty lifecycle.

2) `ht` (record/replay) + headless renderer
   - Pros: battle-tested recorder with browser preview; JSON frame logs.
   - Cons: extra binary download; less control over fixture injection; heavier in CI.

3) Charmbracelet `vhs` (script -> GIF/frames)
   - Pros: simple DSL; good for docs.
   - Cons: focuses on GIF output, harder to diff deterministically; binary dependency.

Decision: use option 1; keep room to import `ht` later for manual captures.

## Architecture
- **Scenario definitions** (`tui/src/test-harness/scenarios/*.ts`): describe fixture seed, key sequence, timing (ms between keys), terminal size, expected focus/selection metadata.
- **Fixtures** (`tui/src/test-harness/fixtures/mockStore.ts`): deterministic BeadsStore data; covers long titles, unicode, dependency edges, and list density; no filesystem writes.
- **Runner (ptyRunner)** (`tui/src/test-harness/ptyRunner.ts`): spawns `npm run tui:start` equivalent entry with `node-pty`; sets `COLUMNS`, `LINES`, `TERM`, `TZ`, seeded RNG; feeds keys with delays; records stdout/stderr and timestamped frame log; enforces overall timeout; exits nonzero on crash/hang.
- **Renderer** (`terminalRenderer.ts`): replays ANSI frames into `@xterm/headless` with fixed size; exports final buffer as text (serialize add-on) and as cell grid for PNG.
- **PNG snapshot** (`pngSnapshot.ts`): renders cell grid to PNG via `node-canvas` (font path configurable, default JetBrains Mono/Fira Code fallback) and writes metadata (font hash, size) alongside outputs.
- **Compare/report** (`compare.ts` + `report.ts`): compare current vs baseline using pixelmatch (tolerance configurable); produce HTML with keyboard navigation, alt text, diff toggle; artifacts in `tmp/tui-visual-report/<scenario>/`.
- **Scripts**: `npm run test:tui:visual` runs compare; `npm run test:tui:visual -- --update` refreshes baselines; root proxies provided. Env flag `TUI_VISUAL_ENABLED=1` gates heavy deps; no-op otherwise.
- **Snapshot layout**: baselines stored under `tui/__snapshots__/baseline/<scenario>.txt|png`; actuals/diffs under `tmp/tui-visual-report/<scenario>/` (gitignored).

## Determinism checklist
- Terminal: set `COLUMNS`/`LINES` per scenario; default 80x24.
- Time: `TZ=UTC`, freeze `Date.now()`/`performance.now()` via fake timers in harness; deterministic timestamps in metadata only.
- Random: seed `Math.random` via injectable RNG.
- Fonts: bundle/test for `JetBrains Mono` or `Fira Code`; fallback monospace with measured width guard that fails fast on mismatch.
- Rendering: disable Unicode width ambiguity by pre-normalizing strings; test wide chars in fixtures.
- Delays: per-key delay defaults to 30–50ms; runner awaits render settle (frame debounce) before capture.

## Scenarios (initial set)
- `nav-basic`: start dashboard, chord `g a`, arrow to cycle, assert tab label/status bar.
- `list-dense`: issues list with long/unicode titles; scroll down/up; expect wrapping/truncation.
- `activity-feed`: render feed with timestamps and status badges; ensure alignment at 80 cols.
- `graph-basic`: open graph view with small dependency set; verify node/edge labels layout.

## Redaction & a11y
- Apply core sanitizers to stdout before writing snapshots; mask `$HOME`, worktree names, tokens/emails.
- Report: alt text for all images, tabindex on controls, visible focus states, high-contrast color palette; link to `docs/accessibility.md`.
- Guard: if running outside `./scripts/task-worktree.sh` context, fail unless `TUI_VISUAL_ALLOW_NON_WORKTREE=1`.

## Risks & mitigations
- Font drift across OS → bundle/test fonts; embed hash in metadata; fail fast if width mismatch.
- Flakes from timing → fake timers + per-step settle time + generous timeout (e.g., 10s per scenario).
- Large artifacts → keep PNGs compressed; cap scenarios to <200 rows; limit snapshots to final frame per scenario.
- Binary availability (node-canvas) → gate install behind `TUI_VISUAL_ENABLED`; document prerequisites in TESTING.md.

## Rollout plan
1) Land harness + renderer gated behind env flag (no-op in CI).
2) Add fixtures and baselines; enable `test:tui:visual` locally.
3) Add HTML report + diff, redaction, a11y polish.
4) Gate optional CI job (`VISUAL_TUI=1`) to run on ubuntu with cached fonts; monitor flake rate (<1%).
5) Remove gate once stable; document maintenance flow and update/approve steps.

## Open questions
- Should we store multiple terminal sizes (e.g., 80x24 and 120x30) for wide layouts? (default: only 80x24; add later if needed.)
- Preferred default font? Recommend JetBrains Mono (bundled); fallback Fira Code.
- Do we need mid-scenario snapshots (not just final frame)? Probably yes for future regressions; start with final-only, extend with optional checkpoints.
