#!/usr/bin/env node
// Lightweight wrapper to run the TUI visual suite with an opt-in flag.
// - Set TUI_VISUAL_ENABLED=1 (or VISUAL_TUI=1) to run the suite.
// - Respects worktree guard and delegates to the @beads/tui workspace script.

import { spawnSync } from 'node:child_process';

const enabled = process.env.TUI_VISUAL_ENABLED === '1' || process.env.VISUAL_TUI === '1';
if (!enabled) {
  console.log('[tui-visual] Skipping: set TUI_VISUAL_ENABLED=1 (or VISUAL_TUI=1) to run visual tests.');
  process.exit(0);
}

const extraArgs = process.argv.slice(2);
const npmArgs = ['run', '-w', '@beads/tui', 'test:visual'];
if (extraArgs.length > 0) {
  npmArgs.push('--', ...extraArgs);
} else if (process.env.TUI_VISUAL_UPDATE === '1') {
  npmArgs.push('--', '--update');
}

const result = spawnSync('npm', npmArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    BEADS_NO_DAEMON: process.env.BEADS_NO_DAEMON ?? '1',
  },
});

process.exit(result.status ?? 1);
