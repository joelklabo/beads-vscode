import * as vscode from 'vscode';
import { sanitizeDependencyId, collectCliErrorOutput, sanitizeErrorMessage, BdCliClient } from '../utils';
import { getCliExecutionConfig } from '../utils/config';
import { findBdCommand } from '../providers/beads/store';
import { currentWorktreeId } from '../worktree';
import { ensureWorkspaceTrusted, runWorktreeGuard } from './runtimeEnvironment';

const t = vscode.l10n.t;

export interface BdCommandOptions {
  workspaceFolder?: vscode.WorkspaceFolder;
  requireGuard?: boolean;
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

  await ensureWorkspaceTrusted(workspaceFolder);

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && !workspaceFolder) {
    throw new Error(t('Project root {0} is not within an open workspace folder', projectRoot));
  }

  if (requireGuard) {
    await runWorktreeGuard(projectRoot);
  }

  const config = vscode.workspace.getConfiguration('beady', workspaceFolder);
  const commandPathSetting = config.get<string>('commandPath', 'bd');
  const commandPath = await findBdCommand(commandPathSetting);
  const cliPolicy = getCliExecutionConfig(config);
  const worktreeId = currentWorktreeId(projectRoot);
  const client = new BdCliClient({ commandPath, cwd: projectRoot, policy: cliPolicy, workspacePaths: [projectRoot], worktreeId });

  await client.run(args);
}
