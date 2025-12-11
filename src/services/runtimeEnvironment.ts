import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { findBdCommand } from '../providers/beads/store';
import { warnIfDependencyEditingUnsupported as warnIfDependencyEditingUnsupportedCli } from '../utils';

const execFileAsync = promisify(execFile);
const t = vscode.l10n.t;
const MIN_DEPENDENCY_CLI = '0.29.0';

let guardWarningShown = false;
let dependencyVersionWarned = false;

export async function runWorktreeGuard(projectRoot: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const guardEnabled = config.get<boolean>('enableWorktreeGuard', true);
  if (!guardEnabled) {
    if (!guardWarningShown) {
      guardWarningShown = true;
      void vscode.window.showWarningMessage(t('Worktree guard disabled; operations may be unsafe.'));
    }
    return;
  }

  const guardPath = path.join(projectRoot, 'scripts', 'worktree-guard.sh');
  try {
    await fs.access(guardPath);
  } catch {
    return;
  }

  await execFileAsync(guardPath, { cwd: projectRoot });
}

export async function ensureWorkspaceTrusted(_workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
  if (vscode.workspace.isTrusted) {
    return;
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VSCODE_TEST === 'true' || !!process.env.VSCODE_TEST_INSTANCE_ID;
  const requestTrust = (vscode.workspace as any).requestWorkspaceTrust;

  if (vscode.workspace.isTrusted || isTestEnv || typeof requestTrust !== 'function') {
    return;
  }

  const trustLabel = t('Trust workspace');
  const message = t('Beads needs a trusted workspace before it can modify issues.');
  const choice = await vscode.window.showWarningMessage(message, trustLabel, t('Cancel'));
  if (choice === trustLabel) {
    const granted = await requestTrust.call(vscode.workspace);
    if (granted || vscode.workspace.isTrusted) {
      return;
    }
  }

  throw new Error(t('Operation blocked: workspace is not trusted.'));
}

export async function warnIfDependencyEditingUnsupported(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady', workspaceFolder);
  if (!config.get<boolean>('enableDependencyEditing', false) || dependencyVersionWarned) {
    return;
  }

  const commandPathSetting = config.get<string>('commandPath', 'bd');
  try {
    const commandPath = await findBdCommand(commandPathSetting);
    await warnIfDependencyEditingUnsupportedCli(commandPath, MIN_DEPENDENCY_CLI, workspaceFolder?.uri.fsPath, (message) => {
      dependencyVersionWarned = true;
      void vscode.window.showWarningMessage(message);
    });
  } catch (error) {
    dependencyVersionWarned = true;
    void vscode.window.showWarningMessage(
      'Could not determine bd version; dependency editing may be unsupported. Ensure bd is installed and on your PATH.'
    );
  }
}

// Test hook to reset module-level warnings
export function resetRuntimeEnvironmentWarnings(): void {
  guardWarningShown = false;
  dependencyVersionWarned = false;
}
