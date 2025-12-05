// TUI shim that re-exports the shared worktree core and adds guard helpers
import {
  type WorktreeEntry,
  type WorktreeRegistry,
  makeWorktreeId,
  isCanonicalWorktreePath,
  buildRegistryFromGit,
  registryPath,
  writeRegistry,
  readRegistry,
  formatWorktreeLabel,
  filterStaleEntries,
  syncRegistry,
  currentWorktreeId,
} from '@worktree';

export {
  type WorktreeEntry,
  type WorktreeRegistry,
  makeWorktreeId,
  isCanonicalWorktreePath,
  buildRegistryFromGit,
  registryPath,
  writeRegistry,
  readRegistry,
  formatWorktreeLabel,
  filterStaleEntries,
  syncRegistry,
  currentWorktreeId,
};

import { execFile } from 'child_process';
import * as path from 'path';
import { BdCliClient, CliExecutionPolicy, formatCliError } from '@beads/core';

export interface GuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Run the shared worktree guard script from the repo root (default: two levels up).
 */
export async function runWorktreeGuard(cwd: string, guardScriptPath?: string): Promise<GuardResult> {
  const script = guardScriptPath ?? path.join(cwd, '..', '..', 'scripts', 'worktree-guard.sh');
  return new Promise((resolve) => {
    execFile(script, { cwd }, (err, _stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: stderr || err.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

/**
 * Wrap a mutating action with worktree guard; surface guard failures to the caller.
 */
export async function guardAndRun<T>(cwd: string, action: () => Promise<T> | T): Promise<T> {
  const guard = await runWorktreeGuard(cwd);
  if (!guard.ok) {
    const error = guard.error ?? 'Unknown worktree guard error';
    throw new Error(`Worktree guard blocked the action: ${error}`);
  }
  return await action();
}

export interface BdRunOptions {
  args: string[];
  cwd: string;
  commandPath?: string;
  policy?: Partial<CliExecutionPolicy>;
  workspacePaths?: string[];
}

/**
 * Guarded bd command helper for the TUI. Automatically enforces worktree guard
 * and injects --no-daemon via the shared BdCliClient.
 */
export async function runGuardedBd(options: BdRunOptions): Promise<void> {
  const { args, cwd, commandPath, policy, workspacePaths } = options;
  const worktreeId = currentWorktreeId(cwd);
  const paths = workspacePaths ?? [cwd];

  await guardAndRun(cwd, async () => {
    const client = new BdCliClient({ commandPath, cwd, policy, workspacePaths: paths, worktreeId });
    try {
      await client.run(args);
    } catch (error) {
      const safeMessage = formatCliError('bd command failed', error, paths, worktreeId);
      throw new Error(safeMessage);
    }
  });
}

export const worktreeLabel = (cwd: string): string => {
  const id = currentWorktreeId(cwd);
  return id ? `wt:${id}` : 'wt:main';
};

export interface ActivityRow {
  id: string;
  worktreeId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Filter activity rows by worktree id (if provided) and dedupe by (worktreeId,id,timestamp).
 */
export function filterAndDedupeActivity(rows: ActivityRow[], worktreeId?: string): ActivityRow[] {
  const filtered = worktreeId ? rows.filter((r) => r.worktreeId === worktreeId) : rows;
  const seen = new Set<string>();
  const result: ActivityRow[] = [];
  for (const row of filtered) {
    const key = `${row.worktreeId || 'main'}::${row.id}::${row.timestamp ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}
