import * as vscode from 'vscode';
import { DEFAULT_CLI_POLICY, CliExecutionPolicy } from '@beads/core';

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

export interface BulkActionsConfig {
  enabled: boolean;
  maxSelection: number;
  validationError?: string;
}

export interface CliExecutionConfig
  extends Pick<CliExecutionPolicy, 'timeoutMs' | 'retryCount' | 'retryBackoffMs' | 'offlineThresholdMs'> {}

const FEEDBACK_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const DEFAULT_FEEDBACK_LABELS: FeedbackLabelMap = Object.freeze({
  bug: 'bug',
  feature: 'enhancement',
  question: 'question',
  other: 'feedback'
});

const DEFAULT_BULK_MAX_SELECTION = 50;
const MIN_BULK_SELECTION = 1;
const MAX_BULK_SELECTION = 200;

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

function normalizeBulkMaxSelection(raw: number | undefined): { maxSelection: number; validationError?: string } {
  if (raw === undefined || raw === null) {
    return { maxSelection: DEFAULT_BULK_MAX_SELECTION };
  }

  if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
    return {
      maxSelection: DEFAULT_BULK_MAX_SELECTION,
      validationError: 'bulkActions.maxSelection must be an integer between 1 and 200'
    };
  }

  if (raw < MIN_BULK_SELECTION || raw > MAX_BULK_SELECTION) {
    return {
      maxSelection: DEFAULT_BULK_MAX_SELECTION,
      validationError: 'bulkActions.maxSelection must be between 1 and 200'
    };
  }

  return { maxSelection: raw };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function resolveConfig(
  configOrWorkspace?: vscode.WorkspaceConfiguration | vscode.WorkspaceFolder
): vscode.WorkspaceConfiguration {
  if (configOrWorkspace && typeof (configOrWorkspace as vscode.WorkspaceConfiguration).get === 'function') {
    return configOrWorkspace as vscode.WorkspaceConfiguration;
  }

  return vscode.workspace.getConfiguration('beady', configOrWorkspace as vscode.WorkspaceFolder | undefined);
}

export function getFeedbackConfig(workspaceFolder?: vscode.WorkspaceFolder): FeedbackConfig {
  const config = resolveConfig(workspaceFolder);
  const repositoryRaw = (config.get<string>('feedback.repository', '') || '').trim();
  const repoValid = repositoryRaw.length === 0 ? false : FEEDBACK_REPO_PATTERN.test(repositoryRaw);
  const [owner, repo] = repoValid ? repositoryRaw.split('/', 2) : [undefined, undefined];

  const rawLabels = config.get<FeedbackLabelMap>('feedback.labels', DEFAULT_FEEDBACK_LABELS);
  const labels = normalizeFeedbackLabels(rawLabels);

  const enabledFlag = config.get<boolean>('feedback.enabled', false);
  const useGitHubCli = config.get<boolean>('feedback.useGitHubCli', false);
  const includeAnonymizedLogs = config.get<boolean>('feedback.includeAnonymizedLogs', true);

  const feedbackConfig: FeedbackConfig = {
    enabled: enabledFlag && repoValid,
    repository: repositoryRaw,
    labels,
    useGitHubCli,
    includeAnonymizedLogs,
  };

  if (owner) {
    feedbackConfig.owner = owner;
  }
  if (repo) {
    feedbackConfig.repo = repo;
  }
  if (enabledFlag && !repoValid) {
    feedbackConfig.validationError = 'feedback.repository must use owner/repo format';
  }

  return feedbackConfig;
}

export function getBulkActionsConfig(workspaceFolder?: vscode.WorkspaceFolder): BulkActionsConfig {
  const config = resolveConfig(workspaceFolder);
  const enabled = config.get<boolean>('bulkActions.enabled', false);
  const { maxSelection, validationError } = normalizeBulkMaxSelection(
    config.get<number>('bulkActions.maxSelection', DEFAULT_BULK_MAX_SELECTION)
  );

  const bulkConfig: BulkActionsConfig = {
    enabled: enabled && !validationError,
    maxSelection,
  };

  if (validationError) {
    bulkConfig.validationError = validationError;
  }

  return bulkConfig;
}

export function getCliExecutionConfig(
  configOrWorkspace?: vscode.WorkspaceConfiguration | vscode.WorkspaceFolder
): CliExecutionConfig {
  const config = resolveConfig(configOrWorkspace);

  const timeoutMs = clampNumber(config.get<number>('cli.timeoutMs', DEFAULT_CLI_POLICY.timeoutMs), 15000, 1000, 120000);
  const retryCount = clampNumber(config.get<number>('cli.retryCount', DEFAULT_CLI_POLICY.retryCount), 1, 0, 5);
  const retryBackoffMs = clampNumber(
    config.get<number>('cli.retryBackoffMs', DEFAULT_CLI_POLICY.retryBackoffMs),
    500,
    0,
    30000
  );
  const offlineThresholdMs = clampNumber(
    config.get<number>('offlineDetection.thresholdMs', DEFAULT_CLI_POLICY.offlineThresholdMs),
    30000,
    5000,
    300000
  );

  return { timeoutMs, retryCount, retryBackoffMs, offlineThresholdMs };
}
