/**
 * Additional command handlers that don't fit into other command modules.
 */

import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from '../providers/beads/treeDataProvider';
import { getWorkspaceOptions } from '../utils/workspace';

const t = vscode.l10n.t;

/**
 * Command to select the active workspace in a multi-root workspace setup.
 */
export async function selectWorkspace(provider: BeadsTreeDataProvider): Promise<void> {
  const workspaces = vscode.workspace.workspaceFolders ?? [];
  const options = getWorkspaceOptions(workspaces);

  if (options.length <= 1) {
    void vscode.window.showInformationMessage(t('No additional workspaces to select.'));
    return;
  }

  const pick = await vscode.window.showQuickPick(
    options.map((opt) => ({ label: opt.label, value: opt.id })),
    { placeHolder: t('Select workspace for Beads view') }
  );

  if (!pick) {
    return;
  }

  await provider.setActiveWorkspace(pick.value);
}
