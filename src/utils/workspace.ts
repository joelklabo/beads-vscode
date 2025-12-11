import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Resolve the project root for the Beads extension based on configuration and workspace folders.
 * Mirrors the previous inline helper in extension.ts so other modules can share the logic.
 */
export function resolveProjectRoot(
  config: vscode.WorkspaceConfiguration,
  workspaceFolder?: vscode.WorkspaceFolder
): string | undefined {
  const projectRootConfig = config.get<string>('projectRoot');
  if (projectRootConfig && projectRootConfig.trim().length > 0) {
    if (path.isAbsolute(projectRootConfig)) {
      return projectRootConfig;
    }
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, projectRootConfig);
    }
    const firstFolder = vscode.workspace.workspaceFolders?.[0];
    if (firstFolder) {
      return path.join(firstFolder.uri.fsPath, projectRootConfig);
    }
    return projectRootConfig;
  }

  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const firstWorkspace = workspaceFolders?.[0];
  if (firstWorkspace) {
    return firstWorkspace.uri.fsPath;
  }

  return undefined;
}


export interface WorkspaceOption {
  id: string;
  label: string;
  workspaceFolder?: vscode.WorkspaceFolder | null;
}

const WORKSPACE_SELECTION_KEY = 'beady.activeWorkspaceId';

export function getWorkspaceOptions(workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined): WorkspaceOption[] {
  const options: WorkspaceOption[] = [{ id: 'all', label: 'All Workspaces', workspaceFolder: null }];
  (workspaceFolders ?? []).forEach((folder) => {
    options.push({ id: folder.uri.toString(), label: folder.name, workspaceFolder: folder });
  });
  return options;
}

export function findWorkspaceById(
  id: string | undefined,
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): vscode.WorkspaceFolder | undefined {
  if (!id || id === 'all') {
    return undefined;
  }
  return (workspaceFolders ?? []).find((folder) => folder.uri.toString() === id);
}

export function loadSavedWorkspaceSelection(context: vscode.ExtensionContext): string | undefined {
  return context.workspaceState.get<string>(WORKSPACE_SELECTION_KEY);
}

export async function saveWorkspaceSelection(context: vscode.ExtensionContext, id: string): Promise<void> {
  await context.workspaceState.update(WORKSPACE_SELECTION_KEY, id);
}
