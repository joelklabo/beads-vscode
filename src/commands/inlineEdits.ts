/**
 * Inline edit command handlers.
 *
 * These commands allow users to quickly edit bead properties inline:
 * - inlineStatusQuickChange: Change status on selected beads
 * - inlineEditTitle: Edit the title of a single bead
 * - inlineEditLabels: Add or remove labels on a single bead
 * - editAssignee: Edit the assignee of a single bead
 */

import * as vscode from 'vscode';
import {
  BeadItemData,
  sanitizeInlineText,
  validateStatusChange,
  formatStatusLabel,
  validateAssigneeInput,
  executeBulkStatusUpdate,
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
 * Interface for activity event items.
 */
export interface ActivityEventItemLike {
  event: { issueId?: string };
}

/**
 * Interface for provider with label editing capabilities.
 */
export interface LabelEditableProvider {
  refresh(): Promise<void>;
  updateTitle(bead: BeadItemData, title: string): Promise<void>;
  addLabel(bead: BeadItemData, label: string): Promise<void>;
  removeLabel(bead: BeadItemData, label: string): Promise<void>;
  updateAssignee(bead: BeadItemData, assignee: string): Promise<void>;
  findTreeItemById(id: string): Promise<unknown | undefined>;
  /** Internal items array - accessed for selection lookup */
  readonly items?: BeadItemData[];
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
 * Type guard to check if an item is an activity event item.
 */
function isActivityEventItem(item: unknown): item is ActivityEventItemLike {
  return (
    item !== null &&
    typeof item === 'object' &&
    'event' in item &&
    item.event !== null &&
    typeof item.event === 'object'
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
function validationMessage(kind: 'assignee', reason?: string): string {
  const messages: Record<string, string> = {
    assignee: t('Invalid assignee'),
  };
  const base = messages[kind] || t('Invalid input');
  return reason ? `${base}: ${reason}` : base;
}

/**
 * Derive assignee name from bead data.
 */
function deriveAssigneeName(bead: BeadItemData, fallback: string): string {
  const raw = bead.raw as Record<string, unknown> | undefined;
  if (!raw) {
    return fallback;
  }

  const assignee = raw.assignee;
  if (typeof assignee === 'string' && assignee.trim()) {
    return assignee.trim();
  }

  if (typeof assignee === 'object' && assignee !== null) {
    const obj = assignee as Record<string, unknown>;
    const name = obj.name ?? obj.login ?? obj.username ?? obj.email;
    if (typeof name === 'string' && name.trim()) {
      return name.trim();
    }
  }

  return fallback;
}

/**
 * Collect selected beads from tree view and activity feed.
 */
function collectSelectedBeads(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown>,
  activityFeedView?: vscode.TreeView<unknown>
): BeadItemData[] {
  const treeSelections = treeView.selection
    .filter(isBeadTreeItem)
    .map((item) => item.bead);

  const feedSelections = (activityFeedView?.selection ?? [])
    .filter(isActivityEventItem)
    .map((item) => item.event.issueId)
    .filter((id): id is string => Boolean(id));

  const providerItems = provider.items ?? [];
  const feedBeads = feedSelections
    .map((id) => providerItems.find((b) => b.id === id))
    .filter((b): b is BeadItemData => Boolean(b));

  const combined = [...treeSelections, ...feedBeads];
  const seen = new Set<string>();
  return combined.filter((b) => {
    if (seen.has(b.id)) {
      return false;
    }
    seen.add(b.id);
    return true;
  });
}

/**
 * Restore focus to a bead item in the tree view after an edit.
 */
async function restoreFocus(
  treeView: vscode.TreeView<unknown>,
  provider: LabelEditableProvider,
  beadId: string
): Promise<void> {
  if (!treeView) {
    return;
  }
  try {
    const element = await provider.findTreeItemById(beadId);
    if (element) {
      await treeView.reveal(element, { select: true, focus: true });
    }
  } catch (error) {
    console.warn('[InlineEdit] Failed to restore selection', error);
  }
}

/**
 * Inline edit title of a single selected bead.
 */
export async function inlineEditTitle(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown>
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);
  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to rename items inline.')
    );
    return;
  }

  const beads = collectSelectedBeads(provider, treeView);
  if (!beads || beads.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to rename.'));
    return;
  }

  const bead = beads[0];
  const newTitle = await vscode.window.showInputBox({
    prompt: t('Enter a new title'),
    value: bead.title,
    ignoreFocusOut: true,
  });

  if (newTitle === undefined || newTitle.trim() === '' || newTitle.trim() === bead.title) {
    return;
  }

  await provider.updateTitle(bead, newTitle.trim());
  await restoreFocus(treeView, provider, bead.id);
}

/**
 * Inline edit labels of a single selected bead.
 */
export async function inlineEditLabels(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown>
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);
  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to edit labels inline.')
    );
    return;
  }

  const beads = collectSelectedBeads(provider, treeView);
  if (!beads || beads.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to edit labels.'));
    return;
  }

  const bead = beads[0];
  const raw = bead.raw as Record<string, unknown> | undefined;
  const labels: string[] = Array.isArray(raw?.labels)
    ? (raw.labels as unknown[]).map((l) => String(l))
    : bead.tags ?? [];

  const action = await vscode.window.showQuickPick(
    [
      { label: t('Add label'), value: 'add' },
      {
        label: t('Remove label'),
        value: 'remove',
        description: labels.length === 0 ? t('No labels to remove') : undefined,
        alwaysShow: true,
      },
    ],
    { placeHolder: t('Edit labels'), canPickMany: false }
  );

  if (!action) {
    return;
  }

  if (action.value === 'add') {
    const label = await vscode.window.showInputBox({
      prompt: t('Enter a label to add'),
      ignoreFocusOut: true,
    });
    if (!label || label.trim() === '') {
      return;
    }
    await provider.addLabel(bead, label.trim());
    await restoreFocus(treeView, provider, bead.id);
    return;
  }

  if (labels.length === 0) {
    void vscode.window.showWarningMessage(t('This bead has no labels to remove.'));
    return;
  }

  const labelPick = await vscode.window.showQuickPick<{ label: string }>(
    labels.map((l) => ({ label: l })),
    {
      placeHolder: t('Select a label to remove'),
      canPickMany: false,
    }
  );

  if (!labelPick) {
    return;
  }

  await provider.removeLabel(bead, labelPick.label);
  await restoreFocus(treeView, provider, bead.id);
}

/**
 * Quick status change on selected beads.
 */
export async function inlineStatusQuickChange(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown>,
  activityFeedView: vscode.TreeView<unknown> | undefined,
  runCommand: RunBdCommandFn
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to change status inline.')
    );
    return;
  }

  const beads = collectSelectedBeads(provider, treeView, activityFeedView);
  if (!beads || beads.length === 0) {
    void vscode.window.showWarningMessage(t('No beads selected. Select one or more items to change status.'));
    return;
  }

  const statusLabels = getStatusLabels();
  const statusPick = await vscode.window.showQuickPick(
    [
      { label: statusLabels.open, description: 'open', value: 'open' },
      { label: statusLabels.in_progress, description: 'in_progress', value: 'in_progress' },
      { label: statusLabels.blocked, description: 'blocked', value: 'blocked' },
      { label: statusLabels.closed, description: 'closed', value: 'closed' },
    ],
    {
      placeHolder: t('Select a new status to apply'),
      ignoreFocusOut: true,
    }
  );

  if (!statusPick) {
    return;
  }

  const targetStatus = statusPick.value;
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const transitionable = beads.filter((bead) => validateStatusChange(bead.status, targetStatus).allowed);
  const skipped = beads
    .filter((bead) => !validateStatusChange(bead.status, targetStatus).allowed)
    .map((bead) => bead.id);

  if (transitionable.length === 0) {
    void vscode.window.showWarningMessage(
      t('All selected items are already in status {0}.', formatStatusLabel(targetStatus))
    );
    return;
  }

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('Updating status for {0} item(s)...', transitionable.length),
      cancellable: false,
    },
    async (progress) => {
      return executeBulkStatusUpdate(
        transitionable.map((bead) => bead.id),
        targetStatus,
        async (id) => {
          await runCommand(['update', id, '--status', targetStatus], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();

  if (summary.successes.length > 0) {
    void vscode.window.showInformationMessage(t('Updated status for {0} item(s)', summary.successes.length));
  }

  if (skipped.length > 0) {
    void vscode.window.showWarningMessage(
      t('Skipped {0} item(s) already in that status: {1}', skipped.length, skipped.join(', '))
    );
  }

  if (summary.failures.length > 0) {
    const failureList = summary.failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ');
    void vscode.window.showErrorMessage(t('Failed to update {0} item(s): {1}', summary.failures.length, failureList));
  }
}

/**
 * Edit assignee of a single bead.
 */
export async function editAssignee(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown> | undefined,
  bead?: BeadItemData
): Promise<void> {
  const selected = bead ? [bead] : treeView ? collectSelectedBeads(provider, treeView) : [];

  if (!selected || selected.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to edit the assignee.'));
    return;
  }

  const target = selected[0];
  const currentAssignee = sanitizeInlineText(deriveAssigneeName(target, ''));
  const placeholder = t('Name or handle (blank to clear)');

  const input = await vscode.window.showInputBox({
    prompt: t('Set or clear the assignee'),
    placeHolder: placeholder,
    value: currentAssignee,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const result = validateAssigneeInput(value);
      return result.valid ? undefined : validationMessage('assignee', result.reason);
    },
  });

  if (input === undefined) {
    return;
  }

  const validation = validateAssigneeInput(input);
  if (!validation.valid) {
    void vscode.window.showWarningMessage(validationMessage('assignee', validation.reason));
    return;
  }

  await provider.updateAssignee(target, validation.value ?? '');

  if (treeView) {
    await restoreFocus(treeView, provider, target.id);
  }
}

/**
 * Create inline edit command definitions with bound dependencies.
 */
export function createInlineEditCommands(
  provider: LabelEditableProvider,
  treeView: vscode.TreeView<unknown>,
  activityFeedView: vscode.TreeView<unknown> | undefined,
  runCommand: RunBdCommandFn
): CommandDefinition[] {
  return [
    {
      id: 'beady.inlineStatusChange',
      handler: () => inlineStatusQuickChange(provider, treeView, activityFeedView, runCommand),
      description: 'Quick status change on selected beads',
    },
    {
      id: 'beady.inlineEditTitle',
      handler: () => inlineEditTitle(provider, treeView),
      description: 'Edit title of selected bead',
    },
    {
      id: 'beady.inlineEditLabels',
      handler: () => inlineEditLabels(provider, treeView),
      description: 'Add or remove labels on selected bead',
    },
    {
      id: 'beady.editAssignee',
      handler: (...args: unknown[]) => editAssignee(provider, treeView, args[0] as BeadItemData | undefined),
      description: 'Edit assignee of selected bead',
    },
  ];
}
