# ADR: Bundle the VS Code extension with esbuild

- Status: Proposed
- Date: 2025-12-06
- Owner: codex
- Related issues: beads-rvd (epic), beads-42b (this ADR), beads-mq0 (bundle implementation), beads-wwf (metadata size), beads-0rd (install-local fix)

## Context
- The extension currently ships the raw TypeScript build output under `out/` plus full workspace node_modules, producing a ~5 MB VSIX with ~2k JS files and slower activation/file-scanning in VS Code.
- Microsoft guidance recommends bundling and trimming the payload (`vsce` warning appears during packaging).
- We need a bundling approach that works for both desktop and web extension hosts, respects our layered monorepo (`@beads/*` packages), and keeps existing dev/test flows (tsc for tests, bd/worktree guard) intact.

## Decision
1) **Bundler**: Use **esbuild** (Node target) for the VS Code extension.
   - Rationale: fastest iterations, first-class TypeScript + sourcemaps, simple config, good path-alias support via `tsconfigPaths` plugin; no heavy plugin graph compared to Rollup/webpack.
2) **Entry/output**: Bundle `src/extension.ts` to `dist/extension.js` with an external sourcemap `dist/extension.js.map`. Format `cjs`, platform `node`, target `node18` (matches `engines.vscode` floor).
3) **Externals**: Do **not** bundle `vscode`, `@vscode/test-electron`, or Node built-ins. Bundle all first-party workspaces (`@beads/core`, `@beads/ui-headless`, `@beads/platform-vscode`) and third-party deps (sanitize-html, zod, octokit) to shrink file count.
4) **Type checking**: Keep `tsc --noEmit` as `npm run typecheck` for CI/dev. Retain `npm run compile` (tsc -b) for test builds that rely on `out/` (mocha/integration). `vscode:prepublish` will run `typecheck && bundle`.
5) **Dev ergonomics**: Add `npm run bundle:watch` (incremental esbuild) for local hacking; keep `npm run watch` (tsc -b --watch) for test builds.
6) **Source maps & minify**: Emit external sourcemaps with sourcesContent for debugger parity; default no minify for readability, allow `--minify` flag in CI size gate if budget requires.
7) **Size guard**: Set a provisional VSIX budget of ≤3 MB zipped (TBD in bundle task) and measure via `vsce ls --packagePath <vsix>` during CI; fail CI if exceeded.
8) **Artifacts**: Point `package.json` `main/types` and `packages/platform-vscode/package.json` to `dist/extension.js(.d.ts)` once bundle task lands. Keep `dist/` gitignored.

## Alternatives considered
- **Rollup**: Strong tree-shaking and multi-format output, but slower iterations and more config/plugins; esbuild meets needs with less surface area.
- **webpack**: Mature ecosystem and asset handling, but heavier config and slower builds; unnecessary given pure-TS, Node-target bundle.
- **No bundle + tighter .vscodeignore**: Reduces VSIX size partially but still leaves thousands of files and slower activation.

## Consequences
- Packaging warns resolved; VSIX shrinks and activation I/O drops by shipping a single entry file.
- Dev/test flows remain: tsc for tests, esbuild for runtime packaging; two outputs (`out/` for tests, `dist/` for VS Code runtime).
- Need to maintain tsconfig path alignment and keep bundle config updated when adding native deps (would become externals).

## Open questions / follow-ups
- Confirm whether we minify in CI or keep readable bundle (decide after measuring size).
- Decide if `@beads/web` ever needs to stay external (likely still bundled off) once we add webviews.
- Validate bundle in web extension host (Edge/Chromium) and ensure no Node-only APIs leak into shared code paths.
