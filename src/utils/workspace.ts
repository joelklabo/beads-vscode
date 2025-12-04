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
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}
