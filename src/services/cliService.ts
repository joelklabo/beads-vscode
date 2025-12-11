import * as vscode from 'vscode';
import { sanitizeDependencyId, collectCliErrorOutput, sanitizeErrorMessage, BdCliClient } from '../utils';
import type { CliExecutionPolicy, BdCliClientOptions } from '@beads/core';
import { getCliExecutionConfig } from '../utils/config';
import { findBdCommand } from '../providers/beads/store';
import { currentWorktreeId } from '../worktree';
import { ensureWorkspaceTrusted, runWorktreeGuard } from './runtimeEnvironment';

const t = vscode.l10n.t;

const commandQueues = new Map<string, Promise<unknown>>();

async function enqueueCommand<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = commandQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  commandQueues.set(key, next.finally(() => { if (commandQueues.get(key) === next) { commandQueues.delete(key); } }));
  return next;
}

export interface BdCommandOptions {
  workspaceFolder?: vscode.WorkspaceFolder;
  requireGuard?: boolean;
  guardRunner?: (projectRoot: string) => Promise<void>;
  trustChecker?: (workspaceFolder?: vscode.WorkspaceFolder) => Promise<void>;
  execCli?: (options: {
    args: string[];
    projectRoot: string;
    cwd?: string;
    commandPath: string;
    policy: CliExecutionPolicy;
    workspaceFolder?: vscode.WorkspaceFolder;
    worktreeId?: string;
  }) => Promise<void>;
}

// Surface bd stderr to users while redacting workspace paths to avoid leaking secrets.
export function formatBdError(prefix: string, error: unknown, projectRoot?: string): string {
  const workspacePaths = projectRoot ? [projectRoot] : [];
  const worktreeId = projectRoot ? currentWorktreeId(projectRoot) : undefined;
  const combined = collectCliErrorOutput(error);
  const sanitized = sanitizeErrorMessage(combined || error, workspacePaths, worktreeId);
  return sanitized ? `${prefix}: ${sanitized}` : prefix;
}

export function resolveBeadId(input: any): string | undefined {
  return sanitizeDependencyId(input?.id ?? input?.bead?.id ?? input?.issueId);
}

export async function runBdCommand(args: string[], projectRoot: string, options: BdCommandOptions = {}): Promise<void> {
  const workspaceFolder = options.workspaceFolder ?? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRoot));
  const requireGuard = options.requireGuard !== false;
  const guardRunner = options.guardRunner ?? runWorktreeGuard;
  const trustChecker = options.trustChecker ?? ensureWorkspaceTrusted;

  await enqueueCommand(projectRoot, async () => {
    await trustChecker(workspaceFolder);

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && !workspaceFolder) {
      throw new Error(t('Project root {0} is not within an open workspace folder', projectRoot));
    }

    if (requireGuard) {
      await guardRunner(projectRoot);
    }

    const config = vscode.workspace.getConfiguration('beady', workspaceFolder);
    const commandPathSetting = config.get<string>('commandPath', 'bd');
    const commandPath = await findBdCommand(commandPathSetting);
    const cliPolicy = getCliExecutionConfig(config);
    const worktreeId = currentWorktreeId(projectRoot);

    if (options.execCli) {
      const execOptions: {
        args: string[];
        projectRoot: string;
        cwd?: string;
        commandPath: string;
        policy: CliExecutionPolicy;
        workspaceFolder?: vscode.WorkspaceFolder;
        worktreeId?: string;
      } = { args, projectRoot, cwd: projectRoot, commandPath, policy: cliPolicy };
      if (workspaceFolder) {
        execOptions.workspaceFolder = workspaceFolder;
      }
      if (worktreeId) {
        execOptions.worktreeId = worktreeId;
      }
      await options.execCli(execOptions);
      return;
    }

    const clientOptions: BdCliClientOptions = {
      commandPath,
      cwd: projectRoot,
      policy: cliPolicy,
      workspacePaths: [projectRoot],
    };
    if (worktreeId) {
      clientOptions.worktreeId = worktreeId;
    }

    const client = new BdCliClient(clientOptions);

    await client.run(args);
  });
}
