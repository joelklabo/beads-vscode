#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const enabled = process.env.TUI_VISUAL_ENABLED === '1' || process.env.VISUAL_TUI === '1';
if (!enabled) {
  console.log('[tui-visual] Skipping: set TUI_VISUAL_ENABLED=1 (or VISUAL_TUI=1) to run visual tests.');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runner = path.resolve(__dirname, '..', 'src', 'test-harness', 'ptyRunner.ts');
const extraArgs = process.argv.slice(2);
const result = spawnSync('tsx', [runner, ...extraArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BEADS_NO_DAEMON: process.env.BEADS_NO_DAEMON ?? '1',
  },
});

if (result.error) {
  console.error('[tui-visual] Failed to run harness:', result.error);
}

process.exit(result.status ?? 1);
