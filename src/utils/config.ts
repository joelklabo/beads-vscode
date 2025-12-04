import * as vscode from 'vscode';

export interface FeedbackLabelMap {
  bug?: string;
  feature?: string;
  question?: string;
  other?: string;
  [key: string]: string | undefined;
}

export interface FeedbackConfig {
  enabled: boolean;
  repository?: string;
  owner?: string;
  repo?: string;
  labels: FeedbackLabelMap;
  useGitHubCli: boolean;
  includeAnonymizedLogs: boolean;
  validationError?: string;
}

const FEEDBACK_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const DEFAULT_FEEDBACK_LABELS: FeedbackLabelMap = Object.freeze({
  bug: 'bug',
  feature: 'enhancement',
  question: 'question',
  other: 'feedback'
});

function normalizeFeedbackLabels(raw: FeedbackLabelMap | undefined): FeedbackLabelMap {
  const merged: FeedbackLabelMap = { ...DEFAULT_FEEDBACK_LABELS };

  if (!raw) {
    return merged;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      merged[key] = value.trim();
    }
  }

  return merged;
}

export function getFeedbackConfig(workspaceFolder?: vscode.WorkspaceFolder): FeedbackConfig {
  const config = vscode.workspace.getConfiguration('beads', workspaceFolder);
  const repositoryRaw = (config.get<string>('feedback.repository', '') || '').trim();
  const repoValid = repositoryRaw.length === 0 ? false : FEEDBACK_REPO_PATTERN.test(repositoryRaw);
  const [owner, repo] = repoValid ? repositoryRaw.split('/', 2) : [undefined, undefined];

  const rawLabels = config.get<FeedbackLabelMap>('feedback.labels', DEFAULT_FEEDBACK_LABELS);
  const labels = normalizeFeedbackLabels(rawLabels);

  const enabledFlag = config.get<boolean>('feedback.enabled', false);
  const useGitHubCli = config.get<boolean>('feedback.useGitHubCli', false);
  const includeAnonymizedLogs = config.get<boolean>('feedback.includeAnonymizedLogs', true);

  return {
    enabled: enabledFlag && repoValid,
    repository: repositoryRaw,
    owner,
    repo,
    labels,
    useGitHubCli,
    includeAnonymizedLogs,
    validationError: enabledFlag && !repoValid ? 'feedback.repository must use owner/repo format' : undefined
  };
}
