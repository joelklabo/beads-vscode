/**
 * Bulk operation command handlers.
 *
 * These commands allow users to perform batch operations on multiple beads:
 * - bulkUpdateStatus: Change status on multiple selected beads
 * - bulkAddLabel: Add a label to multiple selected beads
 * - bulkRemoveLabel: Remove a label from multiple selected beads
 */

import * as vscode from 'vscode';
import {
  BeadItemData,
  getBulkActionsConfig,
  buildBulkSelection,
  executeBulkStatusUpdate,
  executeBulkLabelUpdate,
  BulkLabelAction,
  BulkOperationResult,
  summarizeBulkResult,
  sanitizeErrorMessage,
  validateLabelInput,
} from '../utils';
import { resolveProjectRoot } from '../utils/workspace';
import { CommandDefinition } from './registry';

const t = vscode.l10n.t;

/** Error message for missing project root configuration. */
const PROJECT_ROOT_ERROR = 'Beady: No project root configured. Set "beady.projectRoot" or open a workspace folder.';

/**
 * Type for a function that runs bd CLI commands.
 */
export type RunBdCommandFn = (args: string[], projectRoot: string) => Promise<void>;

/**
 * Interface for tree items that represent beads.
 */
export interface BeadTreeItemLike {
  bead: BeadItemData;
}

/**
 * Interface for components that provide refresh capability.
 */
export interface RefreshableProvider {
  refresh(): Promise<void>;
}

/**
 * Type guard to check if an item is a bead tree item.
 */
function isBeadTreeItem(item: unknown): item is BeadTreeItemLike {
  return (
    item !== null &&
    typeof item === 'object' &&
    'bead' in item &&
    item.bead !== null &&
    typeof item.bead === 'object'
  );
}

/**
 * Status label configuration for quick pick items.
 */
interface StatusLabelMap {
  open: string;
  in_progress: string;
  blocked: string;
  closed: string;
}

/**
 * Get localized status labels.
 */
function getStatusLabels(): StatusLabelMap {
  return {
    open: t('Open'),
    in_progress: t('In Progress'),
    blocked: t('Blocked'),
    closed: t('Closed'),
  };
}

/**
 * Generate a validation error message for user input.
 */
function validationMessage(kind: 'label', reason?: string): string {
  const messages: Record<string, string> = {
    label: t('Invalid label'),
  };
  const base = messages[kind] || t('Invalid input');
  return reason ? `${base}: ${reason}` : base;
}

/**
 * Show confirmation dialog for bulk action.
 */
async function confirmBulkAction(actionDescription: string, count: number): Promise<boolean> {
  const proceed = t('Proceed');
  const response = await vscode.window.showWarningMessage(
    t('Apply {0} to {1} bead(s)?', actionDescription, count),
    { modal: true },
    proceed
  );
  return response === proceed;
}

/**
 * Show summary of bulk operation results.
 */
async function showBulkResultSummary(
  actionDescription: string,
  result: BulkOperationResult,
  projectRoot: string
): Promise<void> {
  const sanitizedResult: BulkOperationResult = {
    successes: result.successes,
    failures: result.failures.map((failure) => ({
      ...failure,
      error: sanitizeErrorMessage(failure.error, [projectRoot]),
    })),
  };

  const summary = summarizeBulkResult(sanitizedResult);

  if (summary.failureCount === 0) {
    void vscode.window.showInformationMessage(
      t('{0} succeeded for {1} bead(s)', actionDescription, summary.successCount)
    );
    return;
  }

  const failureList = summary.failureList || summary.failureIds.join(', ');
  const message =
    summary.successCount === 0
      ? t('{0} failed for {1} bead(s): {2}', actionDescription, summary.failureCount, failureList)
      : t(
          '{0} completed with {1} success(es); failed for {2}: {3}',
          actionDescription,
          summary.successCount,
          summary.failureCount,
          failureList
        );

  const copyAction = t('Copy failures');
  const viewAction = t('View failed IDs');
  const selection =
    summary.successCount === 0
      ? await vscode.window.showErrorMessage(message, copyAction, viewAction)
      : await vscode.window.showWarningMessage(message, copyAction, viewAction);

  if (selection === copyAction) {
    await vscode.env.clipboard.writeText(failureList);
    void vscode.window.showInformationMessage(t('Copied failed ids to clipboard'));
  } else if (selection === viewAction) {
    const pick = await vscode.window.showQuickPick(summary.failureIds, {
      placeHolder: t('Select a failed bead id to copy'),
    });
    if (pick) {
      await vscode.env.clipboard.writeText(pick);
      void vscode.window.showInformationMessage(t('Copied {0}', pick));
    }
  }
}

/**
 * Bulk update status on multiple selected beads.
 */
export async function bulkUpdateStatus(
  provider: RefreshableProvider,
  treeView: vscode.TreeView<unknown>,
  runCommand: RunBdCommandFn
): Promise<void> {
  const bulkConfig = getBulkActionsConfig();

  if (!bulkConfig.enabled) {
    const message = bulkConfig.validationError
      ? t('Bulk actions are disabled: {0}', bulkConfig.validationError)
      : t('Enable "beady.bulkActions.enabled" to run bulk status updates.');
    void vscode.window.showWarningMessage(message);
    return;
  }

  const selection = treeView.selection.filter(isBeadTreeItem);
  const { ids, error } = buildBulkSelection(
    selection.map((item) => item.bead),
    bulkConfig.maxSelection
  );

  if (error) {
    if (ids.length === 0) {
      void vscode.window.showWarningMessage(t('Select one or more beads to update.'));
    } else {
      void vscode.window.showWarningMessage(
        t('Select at most {0} beads for bulk update (selected {1}).', bulkConfig.maxSelection, ids.length)
      );
    }
    return;
  }

  const statusLabels = getStatusLabels();
  const statusPick = await vscode.window.showQuickPick(
    [
      { label: statusLabels.open, value: 'open' },
      { label: statusLabels.in_progress, value: 'in_progress' },
      { label: statusLabels.blocked, value: 'blocked' },
      { label: statusLabels.closed, value: 'closed' },
    ],
    {
      placeHolder: t('Set status for {0} bead(s)', ids.length),
    }
  );

  if (!statusPick) {
    return;
  }

  const actionDescription = t('set status to "{0}"', statusPick.label);
  const confirmed = await confirmBulkAction(actionDescription, ids.length);
  if (!confirmed) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const progressTitle = t('Updating status to "{0}" for {1} bead(s)...', statusPick.label, ids.length);

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async (progress) => {
      return executeBulkStatusUpdate(
        ids,
        statusPick.value,
        async (id) => {
          await runCommand(['update', id, '--status', statusPick.value], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();
  await showBulkResultSummary(actionDescription, result, projectRoot);
}

/**
 * Bulk add or remove label on multiple selected beads.
 */
export async function bulkUpdateLabel(
  provider: RefreshableProvider,
  treeView: vscode.TreeView<unknown>,
  action: BulkLabelAction,
  runCommand: RunBdCommandFn
): Promise<void> {
  const bulkConfig = getBulkActionsConfig();

  if (!bulkConfig.enabled) {
    const message = bulkConfig.validationError
      ? t('Bulk actions are disabled: {0}', bulkConfig.validationError)
      : t('Enable "beady.bulkActions.enabled" to run bulk label updates.');
    void vscode.window.showWarningMessage(message);
    return;
  }

  const selection = treeView.selection.filter(isBeadTreeItem);
  const { ids, error } = buildBulkSelection(
    selection.map((item) => item.bead),
    bulkConfig.maxSelection
  );

  if (error) {
    if (ids.length === 0) {
      void vscode.window.showWarningMessage(t('Select one or more beads to update.'));
    } else {
      void vscode.window.showWarningMessage(
        t('Select at most {0} beads for bulk update (selected {1}).', bulkConfig.maxSelection, ids.length)
      );
    }
    return;
  }

  const labelInput = await vscode.window.showInputBox({
    prompt: t('Enter a label to {0}', action === 'add' ? t('add') : t('remove')),
    placeHolder: t('example: urgent'),
    validateInput: (value) => {
      const result = validateLabelInput(value);
      return result.valid ? undefined : validationMessage('label', result.reason);
    },
  });

  if (!labelInput) {
    return;
  }

  const labelResult = validateLabelInput(labelInput);
  if (!labelResult.valid || !labelResult.value) {
    void vscode.window.showWarningMessage(validationMessage('label', labelResult.reason));
    return;
  }

  const label = labelResult.value;
  const actionDescription = action === 'add' ? t('add label "{0}"', label) : t('remove label "{0}"', label);

  const confirmed = await confirmBulkAction(actionDescription, ids.length);
  if (!confirmed) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const progressTitle =
    action === 'add'
      ? t('Adding label "{0}" to {1} bead(s)...', label, ids.length)
      : t('Removing label "{0}" from {1} bead(s)...', label, ids.length);

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async (progress) => {
      return executeBulkLabelUpdate(
        ids,
        label,
        action,
        async (id) => {
          await runCommand(['label', action, id, label], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();
  await showBulkResultSummary(actionDescription, result, projectRoot);
}

/**
 * Create bulk command definitions with bound dependencies.
 */
export function createBulkCommands(
  provider: RefreshableProvider,
  treeView: vscode.TreeView<unknown>,
  runCommand: RunBdCommandFn
): CommandDefinition[] {
  return [
    {
      id: 'beady.bulkUpdateStatus',
      handler: () => bulkUpdateStatus(provider, treeView, runCommand),
      description: 'Bulk update status on selected beads',
    },
    {
      id: 'beady.bulkAddLabel',
      handler: () => bulkUpdateLabel(provider, treeView, 'add', runCommand),
      description: 'Bulk add label to selected beads',
    },
    {
      id: 'beady.bulkRemoveLabel',
      handler: () => bulkUpdateLabel(provider, treeView, 'remove', runCommand),
      description: 'Bulk remove label from selected beads',
    },
  ];
}
