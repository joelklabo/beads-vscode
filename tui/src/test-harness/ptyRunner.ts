import fs from 'fs';
import path from 'path';
import os from 'os';
import { redactLogContent } from '@beads/core/security/sanitize';

interface RunnerOptions {
  scenario?: string;
  cols?: number;
  rows?: number;
  timeoutMs?: number;
  allowNonWorktree?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  outputDir?: string;
}

interface FrameLogEntry {
  data: string;
  timestamp: number;
}

function isWorktreeDir(cwd: string): { ok: boolean; worktreeId?: string } {
  const match = cwd.match(/\/worktrees\/([^/]+)\/([^/]+)/);
  if (match) {
    return { ok: true, worktreeId: match[2] };
  }
  return { ok: false };
}

function ensureWorktreeGuard(cwd: string, allow: boolean): void {
  if (allow) return;
  const res = isWorktreeDir(cwd);
  if (!res.ok) {
    console.error('[ptyRunner] Refusing to run outside a task worktree. Set TUI_VISUAL_ALLOW_NON_WORKTREE=1 to override.');
    process.exit(1);
  }
}

function loadNodePty() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node-pty') as typeof import('node-pty');
  } catch (error) {
    console.error('[ptyRunner] node-pty is not installed. Install it (see TUI visual test infra) or set TUI_VISUAL_ENABLED=1 before npm install.');
    throw error;
  }
}

function parseArgs(): RunnerOptions {
  const args = process.argv.slice(2);
  const opts: RunnerOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--scenario':
        opts.scenario = next;
        i += 1;
        break;
      case '--cols':
        opts.cols = Number(next);
        i += 1;
        break;
      case '--rows':
        opts.rows = Number(next);
        i += 1;
        break;
      case '--timeout':
      case '--timeoutMs':
        opts.timeoutMs = Number(next);
        i += 1;
        break;
      case '--allow-non-worktree':
        opts.allowNonWorktree = true;
        break;
      case '--output':
        opts.outputDir = next;
        i += 1;
        break;
      default:
        break;
    }
  }
  return opts;
}

function defaultCommand(): { command: string; args: string[] } {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return { command: cmd, args: ['run', '-w', '@beads/tui', 'start'] };
}

async function run(): Promise<void> {
  const opts = parseArgs();
  const cwd = process.cwd();
  ensureWorktreeGuard(cwd, opts.allowNonWorktree || process.env.TUI_VISUAL_ALLOW_NON_WORKTREE === '1');

  const { ok, worktreeId } = isWorktreeDir(cwd);
  const workspacePaths = [cwd];

  const { command, args } = opts.command ? { command: opts.command, args: opts.args ?? [] } : defaultCommand();

  const cols = opts.cols ?? (Number(process.env.COLUMNS) || 80);
  const rows = opts.rows ?? (Number(process.env.LINES) || 24);
  const timeoutMs = opts.timeoutMs ?? 15_000;

  const pty = loadNodePty();
  const env = {
    ...process.env,
    COLUMNS: String(cols),
    LINES: String(rows),
    TERM: 'xterm-256color',
    TZ: 'UTC',
    BEADS_NO_DAEMON: '1',
  } as Record<string, string>;

  const frames: FrameLogEntry[] = [];
  const meta = {
    scenario: opts.scenario ?? 'adhoc',
    cols,
    rows,
    command: `${command} ${args.join(' ')}`.trim(),
    startedAt: Date.now(),
    cwd,
  };

  const proc = pty.spawn(command, args, {
    name: 'xterm-color',
    cols,
    rows,
    cwd,
    env,
  });

  proc.onData((data: string) => {
    frames.push({ data, timestamp: Date.now() });
  });

  let exited = false;
  const killTimer = setTimeout(() => {
    if (!exited) {
      exited = true;
      proc.kill();
    }
  }, timeoutMs);

  const exitCode: number = await new Promise((resolve) => {
    proc.onExit(({ exitCode: code }: { exitCode: number | null }) => {
      exited = true;
      clearTimeout(killTimer);
      resolve(code ?? 0);
    });
  });

  const redactedFrames = frames.map((f) => ({
    ...f,
    data: redactLogContent(f.data, { workspacePaths, worktreeId }),
  }));

  const outDir = opts.outputDir || path.join(cwd, 'tmp', 'tui-frames');
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${meta.scenario}-${meta.startedAt}`;
  fs.writeFileSync(path.join(outDir, `${base}.frames.json`), JSON.stringify(redactedFrames, null, 2));
  fs.writeFileSync(path.join(outDir, `${base}.meta.json`), JSON.stringify({ ...meta, exitCode }, null, 2));

  if (exitCode !== 0) {
    console.error(`[ptyRunner] Process exited with code ${exitCode}. Frames saved to ${outDir}.`);
    process.exit(exitCode);
  }

  console.log(`[ptyRunner] Captured ${frames.length} frame(s) at ${cols}x${rows}. Output: ${outDir}`);
}

run().catch((error) => {
  console.error('[ptyRunner] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
