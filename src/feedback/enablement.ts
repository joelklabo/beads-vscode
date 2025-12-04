import * as vscode from 'vscode';
import { getFeedbackConfig, FeedbackConfig } from '../utils/config';
import { resolveProjectRoot } from '../utils/workspace';

export interface FeedbackEnablement {
  enabled: boolean;
  reason?: string;
  config: FeedbackConfig;
  projectRoot?: string;
  workspaceFolder?: vscode.WorkspaceFolder;
}

export function computeFeedbackEnablement(
  options: {
    config?: vscode.WorkspaceConfiguration;
    workspaceFolder?: vscode.WorkspaceFolder;
    feedbackConfig?: FeedbackConfig;
  } = {}
): FeedbackEnablement {
  const workspaceFolder = options.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  const config = options.config ?? vscode.workspace.getConfiguration('beads', workspaceFolder);
  const projectRoot = resolveProjectRoot(config, workspaceFolder);
  const feedbackConfig = options.feedbackConfig ?? getFeedbackConfig(workspaceFolder);

  const enabled = Boolean(projectRoot && feedbackConfig.enabled);
  let reason: string | undefined;

  if (!projectRoot) {
    reason = 'missingProjectRoot';
  } else if (!feedbackConfig.enabled) {
    reason = feedbackConfig.validationError ? `invalidConfig:${feedbackConfig.validationError}` : 'flagDisabled';
  }

  return {
    enabled,
    reason,
    config: feedbackConfig,
    projectRoot,
    workspaceFolder,
  };
}
