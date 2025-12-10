import * as vscode from 'vscode';
import {
  BeadItemData,
  formatError,
  formatSafeError,
  sanitizeErrorMessage,
  sanitizeInlineText,
  escapeHtml,
  isStale,
  validateDependencyAdd,
  sanitizeDependencyId,
  collectCliErrorOutput,
  validateStatusChange,
  formatStatusLabel,
  compareStatus,
  buildBulkSelection,
  executeBulkStatusUpdate,
  executeBulkLabelUpdate,
  summarizeBulkResult,
  BulkLabelAction,
  BulkOperationFailure,
  BulkOperationResult,
  getFavoriteLabel,
  getLocalFavorites,
  saveLocalFavorites,
  sanitizeFavoriteLabel,
  isValidFavoriteLabel,
  validateFavoriteTargets,
  sanitizeFavoriteError,
  syncFavoritesState,
  validateTitleInput,
  validateLabelInput,
  validateStatusInput,
  validateAssigneeInput,
  collectDependencyEdges,
  QuickFilterPreset,
  applyQuickFilter,
  toggleQuickFilter,
  normalizeQuickFilter,
  deriveAssigneeName,
} from './utils';
import { ActivityFeedTreeDataProvider, ActivityEventItem } from './activityFeedProvider';
import { EventType } from './activityFeed';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from './littleGlen/validation';
import {
  AssigneeSectionItem,
  BeadTreeItem,
  BeadDetailItem,
  EpicTreeItem,
  StatusSectionItem,
  SummaryHeaderItem,
  UngroupedSectionItem,
  WarningSectionItem,
  EpicStatusSectionItem,
  getAssigneeInfo,
} from './providers/beads/items';
import {
  BeadsDocument,
  BeadsStore,
  BeadsStoreSnapshot,
  WorkspaceTarget,
  WatcherManager,
  createBeadsStore,
  createWorkspaceTarget,
  createVsCodeWatchAdapter,
  findBdCommand,
  naturalSort,
  saveBeadsDocument,
} from './providers/beads/store';
import { resolveProjectRoot, getWorkspaceOptions, findWorkspaceById, loadSavedWorkspaceSelection, saveWorkspaceSelection } from './utils/workspace';
import { computeFeedbackEnablement } from './feedback/enablement';
import { getBulkActionsConfig } from './utils/config';
import { registerSendFeedbackCommand } from './commands/sendFeedback';
import {
  CommandRegistry,
  createExportCommands,
  createQuickFilterCommands,
  bulkUpdateStatus,
  bulkUpdateLabel,
  toggleFavorites,
  inlineEditTitle,
  inlineEditLabels,
  inlineStatusQuickChange,
  editAssignee,
  selectWorkspace,
} from './commands';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { BeadsWebviewProvider } from './providers/beads/webview';
import { BeadsTreeDataProvider, TreeItemType, getStatusLabels, buildBeadDetailStrings } from './providers/beads/treeDataProvider';
import { currentWorktreeId } from './worktree';
import { warnIfDependencyEditingUnsupported } from './services/runtimeEnvironment';
import { BdCommandOptions, formatBdError, resolveBeadId, runBdCommand } from './services/cliService';
import { registerChatParticipants } from './chatAgents';
import { getBeadDetailHtml } from './views/detail';
import { BeadDetailStrings, StatusLabelMap } from './views/detail/types';
import { createDependencyGraphView } from './views/graph';
import type { GraphEdgeData } from './utils/graph';
import { openActivityFeedPanel } from './views/panels/activityFeedPanel';
import { openInProgressPanel } from './views/panels/inProgressPanel';
import { setupProviders, setupActivityFeed, registerCommands, setupConfigurationWatchers } from './activation';

type DependencyEdge = GraphEdgeData;

const t = vscode.l10n.t;
const PROJECT_ROOT_ERROR = t('Unable to resolve project root. Set "beady.projectRoot" or open a workspace folder.');
const INVALID_ID_MESSAGE = t('Issue ids must contain only letters, numbers, ._- and be under 64 characters.');
const ASSIGNEE_MAX_LENGTH = 64;

function validationMessage(kind: 'title' | 'label' | 'status' | 'assignee', reason?: string): string {
  switch (reason) {
    case 'empty':
      return kind === 'title' ? t('Title cannot be empty.') : t('Label cannot be empty.');
    case 'too_long':
      if (kind === 'title') {
        return t('Title must be 1-{0} characters without new lines.', 256);
      }
      if (kind === 'label') {
        return t('Label must be 1-{0} characters.', 64);
      }
      return t('Assignee must be 0-{0} characters.', ASSIGNEE_MAX_LENGTH);
    case 'invalid_characters':
      return t('The {0} contains unsupported characters.', kind);
    case 'invalid_status':
      return t('Status update blocked: invalid status.');
    case 'already in target status':
      return t('Status update blocked: already in target status.');
    default:
      return t('Invalid {0} value.', kind);
  }
}


function createNonce(): string {
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15);
}


function resolveCommandItem(item: any, provider: BeadsTreeDataProvider): BeadItemData | undefined {
  if (!item) { return undefined; }
  // If it has 'raw' property, it's likely BeadItemData
  if ('raw' in item) { return item as BeadItemData; }
  // If it has 'webviewSection' and 'id', it's from webview context
  if (item.webviewSection === 'bead' && item.id) {
    return (provider as any).items.find((i: any) => i.id === item.id);
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const watchManager = new WatcherManager(createVsCodeWatchAdapter());
  context.subscriptions.push({ dispose: () => watchManager.dispose() });

  let providerRef: BeadsTreeDataProvider | undefined;
  let activationError: unknown;

  const showActivationError = (commandId?: string, error?: unknown): void => {
    const prefix = commandId ? t('Beads command {0} failed', commandId) : t('Beads activation failed');
    const sanitized = formatSafeError(prefix, error ?? activationError ?? t('Unknown error'), [], currentWorktreeId(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''));
    void vscode.window.showErrorMessage(sanitized);
  };

  const registerSortCommand = <Args extends any[]>(commandId: string, handler: (p: BeadsTreeDataProvider, ...args: Args) => unknown): void => {
    const disposable = vscode.commands.registerCommand(commandId, async (...args: Args) => {
      if (!providerRef) {
        showActivationError(commandId);
        return;
      }
      try {
        return await handler(providerRef, ...args);
      } catch (error) {
        console.error(`[beads] ${commandId} failed`, error);
        showActivationError(commandId, error);
      }
    });
    context.subscriptions.push(disposable);
  };

  try {
    // Set up providers and tree views
    const { provider, treeView, dependencyTreeProvider, dependencyTreeView } = setupProviders(context, watchManager);
    providerRef = provider;

    // Set up activity feed
    const { activityFeedProvider, activityFeedView } = setupActivityFeed(context, watchManager, provider);

    // Register all commands
    const activationContext = { provider, treeView, dependencyTreeProvider, dependencyTreeView, activityFeedProvider, activityFeedView };
    registerCommands(
      context,
      activationContext,
      resolveCommandItem,
      openBead,
      openBeadFromFeed,
      (activityFeedProvider: ActivityFeedTreeDataProvider, beadsProvider: BeadsTreeDataProvider) =>
        openActivityFeedPanel({ activityFeedProvider, beadsProvider, openBead: (item) => openBead(item, beadsProvider) }),
      (provider: BeadsTreeDataProvider) => openInProgressPanel({ provider, openBead: (item) => openBead(item, provider) }),
      pickBeadQuick,
      visualizeDependencies
    );

    // Set up configuration watchers
    setupConfigurationWatchers(context, provider);

    // Initial data refresh
    void provider.refresh();
  } catch (error) {
    activationError = error;
    console.error('[beads] activation failed', error);
    showActivationError(undefined, error);
  }

  registerSortCommand('beady.pickSortMode', (p) => p.pickSortMode());
  registerSortCommand('beady.toggleSortMode', (p) => p.toggleSortMode());
}

async function openBead(item: BeadItemData, provider: BeadsTreeDataProvider): Promise<void> {
  const nonce = createNonce();
  const panel = vscode.window.createWebviewPanel(
    'beadDetail',
    item.id,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd())), provider['context']?.extensionUri ?? vscode.Uri.file(process.cwd())],
    }
  );

  // Get all items from the provider to calculate reverse dependencies
  const allItems = provider['items'] as BeadItemData[];
  const statusLabels = getStatusLabels();
  const beadStrings = buildBeadDetailStrings(statusLabels);
  const locale = vscode.env.language || 'en';
  panel.webview.html = getBeadDetailHtml(item, allItems, panel.webview, nonce, beadStrings, locale);

  // Register this panel so it can be refreshed when data changes
  provider.registerPanel(item.id, panel);

  // Handle messages from the webview
  const allowedCommands: AllowedLittleGlenCommand[] = [
    'updateStatus',
    'updateTitle',
    'updateDescription',
    'updateDesign',
    'updateAcceptanceCriteria',
    'updateNotes',
    'updateType',
    'updatePriority',
    'editAssignee',
    'addLabel',
    'removeLabel',
    'addDependency',
    'removeDependency',
    'deleteBead',
    'openBead',
    'openExternalUrl'
  ];

  panel.webview.onDidReceiveMessage(async (message) => {
    const validated = validateLittleGlenMessage(message, allowedCommands);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid panel message');
      void vscode.window.showWarningMessage(t('Ignored invalid request from Little Glen panel.'));
      return;
    }

    switch (validated.command) {
      case 'updateStatus':
        await provider.updateStatus(item, validated.status);
        return;
      case 'updateTitle':
        await provider.updateTitle(item, validated.title);
        return;
      case 'updateDescription':
        await provider.updateDescription(item, validated.value);
        return;
      case 'updateDesign':
        await provider.updateDesign(item, validated.value);
        return;
      case 'updateAcceptanceCriteria':
        await provider.updateAcceptanceCriteria(item, validated.value);
        return;
      case 'updateNotes':
        await provider.updateNotes(item, validated.value);
        return;
      case 'updateType':
        await provider.updateType(item, validated.type);
        return;
      case 'updatePriority':
        await provider.updatePriority(item, validated.priority);
        return;
      case 'editAssignee':
        await editAssignee(provider as any, undefined, item);
        return;
      case 'addLabel':
        if (!validated.label) {
          const input = await vscode.window.showInputBox({
            placeHolder: t('Label name'),
            prompt: t('Enter a label to add'),
            validateInput: (value) => {
              const res = validateLabelInput(value);
              return res.valid ? null : t('Invalid label format');
            }
          });
          if (input) {
            await provider.addLabel(item, input);
          }
        } else {
          await provider.addLabel(item, validated.label);
        }
        return;
      case 'removeLabel':
        await provider.removeLabel(item, validated.label);
        return;
      case 'addDependency': {
        const sourceId = validated.sourceId ?? item.id;
        const targetId = validated.targetId;
        const sourceItem = (provider as any)['items']?.find((i: BeadItemData) => i.id === sourceId) ?? item;
        await addDependencyCommand(provider, sourceItem, targetId ? { sourceId, targetId } : undefined);
        return;
      }
      case 'removeDependency': {
        await removeDependencyCommand(provider, validated.sourceId && validated.targetId ? {
          sourceId: validated.sourceId,
          targetId: validated.targetId,
        } : undefined, { contextId: item.id });
        return;
      }
      case 'deleteBead': {
        const projectRoot = resolveProjectRoot(vscode.workspace.getConfiguration('beady'));
        if (!projectRoot) {
          void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
          return;
        }

        const deleteLabel = t('Delete');
        const answer = await vscode.window.showWarningMessage(
          t('Are you sure you want to delete this bead?\n\n{0}', item.id),
          { modal: true },
          deleteLabel
        );
        if (answer !== deleteLabel) {
          return;
        }

        try {
          await runBdCommand(['delete', item.id, '--force'], projectRoot);
          await provider.refresh();
          panel.dispose();
        } catch (error) {
          console.error('Failed to delete bead from detail view', error);
          void vscode.window.showErrorMessage(formatError(t('Failed to delete bead'), error));
        }
        return;
      }
      case 'openBead': {
        const targetBead = allItems.find((i) => i.id === validated.beadId);
        if (targetBead) {
          await openBead(targetBead, provider);
        } else {
          void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
        }
        return;
      }
      case 'openExternalUrl':
        await vscode.env.openExternal(vscode.Uri.parse(validated.url));
        return;
    }
  });
}

/**
 * Open a bead from the activity feed by ID, with graceful fallback if missing.
 * Returns true when a bead was opened successfully.
 */
async function openBeadFromFeed(
  issueId: string,
  beadsProvider: BeadsTreeDataProvider,
  opener: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void> = openBead
): Promise<boolean> {
  const items = beadsProvider['items'] as BeadItemData[] | undefined;
  const target = items?.find((i) => i.id === issueId);

  if (!target) {
    console.warn(`[ActivityFeed] Issue ${issueId} not found when opening from feed`);
    void vscode.window.showWarningMessage(t('Issue {0} no longer exists or is not loaded.', issueId));
    return false;
  }

  try {
    await opener(target, beadsProvider);
    return true;
  } catch (error) {
    console.error(`[ActivityFeed] Failed to open issue ${issueId} from feed:`, error);
    void vscode.window.showErrorMessage(formatError(t('Failed to open issue from activity feed'), error));
    return false;
  }
}

async function createBead(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: t('Enter a title for the new bead'),
    placeHolder: t('Implement feature X'),
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  try {
    await runBdCommand(['create', name], projectRoot!);
    void vscode.commands.executeCommand('beady.refresh');
    void vscode.window.showInformationMessage(t('Created bead: {0}', name));
  } catch (error) {
    void vscode.window.showErrorMessage(formatError(t('Failed to create bead'), error));
  }
}

async function pickBeadQuick(
  items: BeadItemData[] | undefined,
  placeHolder: string,
  excludeId?: string
): Promise<BeadItemData | undefined> {
  if (!items || items.length === 0) {
    void vscode.window.showWarningMessage(t('No beads are loaded.'));
    return undefined;
  }

  const picks = items
    .filter((i) => i.id !== excludeId)
    .map((i) => ({
      label: i.id,
      description: i.title,
      detail: i.status ? t('Status: {0}', i.status) : undefined,
      bead: i,
    }));

  const selection = await vscode.window.showQuickPick(picks, { placeHolder });
  return selection?.bead;
}

async function addDependencyCommand(
  provider: BeadsTreeDataProvider,
  sourceItem?: BeadItemData,
  edge?: { sourceId?: string; targetId?: string }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
    return;
  }

  const items = (provider as any)['items'] as BeadItemData[] | undefined;
  const safeEdgeSource = edge?.sourceId ? sanitizeDependencyId(edge.sourceId) : undefined;
  const safeEdgeTarget = edge?.targetId ? sanitizeDependencyId(edge.targetId) : undefined;

  if ((edge?.sourceId && !safeEdgeSource) || (edge?.targetId && !safeEdgeTarget)) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const source =
    sourceItem ??
    (safeEdgeSource ? items?.find((i) => i.id === safeEdgeSource) : undefined) ??
    (await pickBeadQuick(items, t('Select the issue that depends on another item')));

  if (!source) {
    return;
  }

  const target = safeEdgeTarget
    ? items?.find((i) => i.id === safeEdgeTarget)
    : await pickBeadQuick(items, t('Select the issue {0} depends on', source.id), source.id);

  if (!target) {
    return;
  }

  const safeSourceId = sanitizeDependencyId(source.id);
  const safeTargetId = sanitizeDependencyId(target.id);
  if (!safeSourceId || !safeTargetId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const validationError = validateDependencyAdd(items ?? [], safeSourceId, safeTargetId);
  if (validationError) {
    void vscode.window.showWarningMessage(t(validationError));
    return;
  }

  await provider.addDependency(source, safeTargetId);
}

async function removeDependencyCommand(provider: BeadsTreeDataProvider, edge?: DependencyEdge, options?: { contextId?: string }): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
    return;
  }

  const items = (provider as any)['items'] as BeadItemData[] | undefined;
  const safeContextId = options?.contextId ? sanitizeDependencyId(options.contextId) : undefined;
  if (options?.contextId && !safeContextId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const edges = collectDependencyEdges(items);
  const scopedEdges = safeContextId
    ? edges.filter((e) => e.sourceId === safeContextId || e.targetId === safeContextId)
    : edges;

  let selectedEdge = edge;
  if (selectedEdge) {
    const safeProvidedSource = sanitizeDependencyId(selectedEdge.sourceId);
    const safeProvidedTarget = sanitizeDependencyId(selectedEdge.targetId);
    if (!safeProvidedSource || !safeProvidedTarget) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }
    selectedEdge = { ...selectedEdge, sourceId: safeProvidedSource, targetId: safeProvidedTarget };
  }

  if (!selectedEdge) {
    if (scopedEdges.length === 0) {
      void vscode.window.showWarningMessage(t('No dependencies available to remove.'));
      return;
    }

    const picks = scopedEdges.map((e) => ({
      label: `${e.sourceId} → ${e.targetId}`,
      description: e.type,
      detail: [e.sourceTitle, e.targetTitle].filter((v) => v && v.length > 0).join(' → '),
      edge: e,
    }));

    const selection = await vscode.window.showQuickPick(picks, { placeHolder: t('Select a dependency to remove') });
    if (!selection) {
      return;
    }
    selectedEdge = selection.edge;
  }

  if (!selectedEdge) {
    return;
  }

  await provider.removeDependency(selectedEdge.sourceId, selectedEdge.targetId);
}

async function visualizeDependencies(provider: BeadsTreeDataProvider): Promise<void> {
  createDependencyGraphView({
    getItems: () => provider['items'] as BeadItemData[],
    openBead: async (bead) => openBead(bead, provider),
    addDependency: async (sourceId, targetId) => {
      await addDependencyCommand(provider, undefined, { sourceId, targetId });
    },
    removeDependency: async (sourceId, targetId, contextId) => {
      await removeDependencyCommand(
        provider,
        sourceId && targetId ? { sourceId, targetId } : undefined,
        { contextId }
      );
    },
  });
}

export function deactivate(): void {
  // no-op
}

// Expose core classes for unit testing
export {
  BeadsTreeDataProvider,
  BeadTreeItem,
  EpicTreeItem,
  UngroupedSectionItem,
  openBeadFromFeed,
  toggleFavorites,
  runBdCommand,
  findBdCommand,
  collectDependencyEdges,
  addDependencyCommand,
  inlineStatusQuickChange,
  inlineEditTitle,
  inlineEditLabels,
  deriveAssigneeName,
  bulkUpdateStatus,
  bulkUpdateLabel,
};
