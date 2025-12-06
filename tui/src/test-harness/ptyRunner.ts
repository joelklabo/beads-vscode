#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { redactLogContent } from '@beads/core/security/sanitize';
import { createHarnessAppConfig, defaultKeyScenarios, KeyStep, sleep, toPtySequence, HARNESS_DEFAULT_CLOCK } from './index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RunnerOptions {
  scenario: string;
  cols: number;
  rows: number;
  timeoutMs: number;
  outputDir: string;
  allowNonWorktree: boolean;
}

interface ExitInfo {
  exitCode: number | null;
  signal: number | null;
  timedOut: boolean;
}

interface FrameLogEntry {
  data: string;
  timestamp: number;
}

interface ScenarioResult extends ExitInfo {
  frames: FrameLogEntry[];
  durationMs: number;
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

async function loadNodePty(): Promise<any> {
  // Defer import so CI without visual deps still works.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const importer = new Function('modulePath', 'return import(modulePath)');
  try {
    return await importer('node-pty');
  } catch (error) {
    console.error('[ptyRunner] node-pty is required. Install via the visual test deps task.');
    throw error;
  }
}

function parseArgs(argv: string[]): RunnerOptions {
  const opts: RunnerOptions = {
    scenario: 'nav-basic',
    cols: 100,
    rows: 30,
    timeoutMs: 10_000,
    outputDir: path.resolve(process.cwd(), 'tmp', 'tui-harness'),
    allowNonWorktree: process.env.TUI_VISUAL_ALLOW_NON_WORKTREE === '1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--scenario':
      case '-s':
        if (next) opts.scenario = next;
        i += 1;
        break;
      case '--cols':
        if (next) opts.cols = Number(next) || opts.cols;
        i += 1;
        break;
      case '--rows':
        if (next) opts.rows = Number(next) || opts.rows;
        i += 1;
        break;
      case '--timeout':
      case '--timeoutMs':
        if (next) opts.timeoutMs = Number(next) || opts.timeoutMs;
        i += 1;
        break;
      case '--output':
      case '-o':
        if (next) opts.outputDir = path.resolve(next);
        i += 1;
        break;
      case '--allow-non-worktree':
        opts.allowNonWorktree = true;
        break;
      default:
        break;
    }
  }

  return opts;
}

function resolveScenario(name: string): KeyStep[] {
  const steps = defaultKeyScenarios[name];
  if (steps && steps.length > 0) return steps;
  throw new Error(`Unknown scenario "${name}". Available: ${Object.keys(defaultKeyScenarios).join(', ')}`);
}

async function driveKeys(pty: any, steps: KeyStep[], defaultDelay = 100): Promise<void> {
  for (const step of steps) {
    await sleep(step.delayMs ?? defaultDelay);
    pty.write(toPtySequence(step.key));
  }
}

async function runScenario(opts: RunnerOptions): Promise<ScenarioResult> {
  ensureWorktreeGuard(process.cwd(), opts.allowNonWorktree);
  const nodePty = await loadNodePty();

  // Warm fixture store to ensure deterministic data when the child process starts.
  createHarnessAppConfig();

  const steps = resolveScenario(opts.scenario);
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLUMNS: String(opts.cols),
    LINES: String(opts.rows),
    TZ: 'UTC',
    TUI_HARNESS: '1',
    TUI_FIXTURE: '1',
    TUI_HARNESS_CLOCK_MS: String(process.env.TUI_HARNESS_CLOCK_MS ?? HARNESS_DEFAULT_CLOCK),
    BEADS_NO_DAEMON: process.env.BEADS_NO_DAEMON ?? '1',
  };

  const runnerPath = path.resolve(__dirname, '..', 'run.js');
  const frames: FrameLogEntry[] = [];
  const startClock = Date.now();

  const pty = nodePty.spawn(process.execPath, [runnerPath], {
    name: 'xterm-256color',
    cols: opts.cols,
    rows: opts.rows,
    cwd: path.resolve(__dirname, '..', '..'),
    env,
  });

  pty.onData((data: string) => {
    frames.push({ data, timestamp: Date.now() });
  });

  void driveKeys(pty, steps).catch((err) => {
    console.error('[ptyRunner] key drive failed', err);
    try {
      pty.kill();
    } catch {
      /* ignore */
    }
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      pty.kill();
    } catch {
      /* noop */
    }
  }, opts.timeoutMs);

  const exitInfo: ExitInfo = await new Promise((resolve) => {
    pty.onExit((evt: { exitCode: number; signal?: number }) => {
      clearTimeout(timeout);
      resolve({ exitCode: evt.exitCode ?? 0, signal: evt.signal ?? null, timedOut });
    });
  });

  const durationMs = Date.now() - startClock;
  return { ...exitInfo, frames, durationMs };
}

function writeArtifacts(opts: RunnerOptions, result: ScenarioResult): { rawPath: string; metaPath: string } {
  const { worktreeId } = isWorktreeDir(process.cwd());
  const workspacePaths = [process.cwd()];
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const rawPath = path.join(opts.outputDir, `${opts.scenario}.ansi`);
  const metaPath = path.join(opts.outputDir, `${opts.scenario}.json`);

  const redactedFrames = result.frames.map((frame) => ({
    ...frame,
    data: redactLogContent(frame.data, { workspacePaths, worktreeId }),
  }));

  const output = redactedFrames.map((f) => f.data).join('');
  fs.writeFileSync(rawPath, output, 'utf8');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        scenario: opts.scenario,
        cols: opts.cols,
        rows: opts.rows,
        startedAt: new Date(result.frames[0]?.timestamp ?? Date.now()).toISOString(),
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        bytes: Buffer.byteLength(output, 'utf8'),
        frameCount: result.frames.length,
      },
      null,
      2
    ),
    'utf8'
  );

  return { rawPath, metaPath };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const result = await runScenario(opts);
    const { rawPath, metaPath } = writeArtifacts(opts, result);
    if (result.timedOut || result.exitCode !== 0) {
      console.error(`[ptyRunner] Scenario "${opts.scenario}" failed (exit=${result.exitCode}, timedOut=${result.timedOut}). See ${metaPath}`);
      process.exit(result.exitCode ?? 1);
    }
    console.log(`[ptyRunner] wrote frames to ${rawPath}`);
  } catch (error) {
    console.error('[ptyRunner] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
