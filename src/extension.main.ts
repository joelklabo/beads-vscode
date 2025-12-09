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
import { getActivityFeedPanelHtml, ActivityFeedStrings } from './views/activityFeed';
import { getInProgressPanelHtml, buildInProgressPanelStrings } from './views/inProgress';

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


const buildActivityFeedStrings = (): ActivityFeedStrings => ({
  title: t('Activity Feed'),
  emptyTitle: t('No activity yet'),
  emptyDescription: t('Events will appear here as you work with issues.'),
  eventsLabel: t('events'),
});

async function openInProgressPanel(provider: BeadsTreeDataProvider): Promise<void> {
  const strings = buildInProgressPanelStrings();
  const locale = vscode.env.language || 'en';
  const panel = vscode.window.createWebviewPanel(
    'inProgressSpotlight',
    strings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  if (!(provider as any)['items'] || (provider as any)['items'].length === 0) {
    await provider.refresh();
  }

  const render = (): void => {
    const items = (provider as any)['items'] as BeadItemData[] || [];
    const inProgress = items.filter((item) => item.status === 'in_progress');
    panel.webview.html = getInProgressPanelHtml(inProgress, strings, locale);
  };

  render();

  const subscription = provider.onDidChangeTreeData(() => render());
  panel.onDidDispose(() => subscription.dispose());

  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid in-progress panel message');
      return;
    }

    if (validated.command === 'openBead') {
      const items = (provider as any)['items'] as BeadItemData[] || [];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (item) {
        await openBead(item, provider);
      } else {
        void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
      }
    }
  });
}

async function openActivityFeedPanel(activityFeedProvider: ActivityFeedTreeDataProvider, beadsProvider: BeadsTreeDataProvider): Promise<void> {
  const activityStrings = buildActivityFeedStrings();
  const locale = vscode.env.language || 'en';
  const panel = vscode.window.createWebviewPanel(
    'activityFeedPanel',
    activityStrings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get events from the provider
  const projectRoot = vscode.workspace.getConfiguration('beady').get<string>('projectRoot') ||
    (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
  
  const { fetchEvents } = await import('./activityFeed');
  const result = await fetchEvents(projectRoot, { limit: 100 });

  panel.webview.html = getActivityFeedPanelHtml(result.events, activityStrings, locale);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid activity feed message');
      return;
    }
    if (validated.command === 'openBead') {
      const items = beadsProvider['items'] as BeadItemData[];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (item) {
        await openBead(item, beadsProvider);
      } else {
        // If item not found in current view, just show a message
        void vscode.window.showInformationMessage(t('Opening issue {0}', validated.beadId));
      }
    }
  });
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
    providerRef = new BeadsTreeDataProvider(context, watchManager);
    if (!providerRef) {
      throw new Error('Beads tree provider failed to initialize');
    }
    const provider = providerRef;
  const treeView = vscode.window.createTreeView('beadyExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    canSelectMany: true,
  });

  const webviewProvider = new BeadsWebviewProvider(context.extensionUri, provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BeadsWebviewProvider.viewType, webviewProvider)
  );

  // Set tree view reference for badge updates
  provider.setTreeView(treeView);

  const dependencyTreeProvider = new DependencyTreeProvider(() => provider['items'] as BeadItemData[] | undefined);
  const dependencyTreeView = vscode.window.createTreeView('beadyDependencyTree', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true,
  });
  const rowExpandOnSelect = treeView.onDidChangeSelection((event) => {
    event.selection.forEach((item) => provider.expandRow(item));
  });
  const dependencySelection = treeView.onDidChangeSelection((event) => {
    const bead = event.selection.find((item): item is BeadTreeItem => item instanceof BeadTreeItem);
    if (bead?.bead) {
      dependencyTreeProvider.setRoot(bead.bead.id);
    }
  });
  const dependencySync = provider.onDidChangeTreeData(() => dependencyTreeProvider.refresh());

  // Track expand/collapse to update icons and persist state
  const expandListener = treeView.onDidExpandElement(event => {
    provider.handleCollapseChange(event.element, false);
  });
  const collapseListener = treeView.onDidCollapseElement(event => {
    provider.handleCollapseChange(event.element, true);
  });

  // Create and register status bar item for stale count
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  provider.setStatusBarItem(statusBarItem);
  context.subscriptions.push(statusBarItem);

  const applyWorkspaceContext = (): void => {
    const count = vscode.workspace.workspaceFolders?.length ?? 0;
    const options = getWorkspaceOptions(vscode.workspace.workspaceFolders);
    const active = options.find((opt) => opt.id === provider.getActiveWorkspaceId()) ?? options[0];
    void vscode.commands.executeCommand('setContext', 'beady.multiRootAvailable', count > 1);
    void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', active?.label ?? '');
  };

  const applyBulkActionsContext = (): void => {
    const bulkConfig = getBulkActionsConfig();
    void vscode.commands.executeCommand('setContext', 'beady.bulkActionsEnabled', bulkConfig.enabled);
    void vscode.commands.executeCommand('setContext', 'beady.bulkActionsMaxSelection', bulkConfig.maxSelection);
  };

  const applyQuickFiltersContext = (): void => {
    const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
    void vscode.commands.executeCommand('setContext', 'beady.quickFiltersEnabled', quickFiltersEnabled);
    provider.syncQuickFilterContext();
  };

  const applySortPickerContext = (): void => {
    const enabled = vscode.workspace.getConfiguration('beady').get<boolean>('sortPicker.enabled', true);
    provider.setSortPickerEnabled(enabled);
    void vscode.commands.executeCommand('setContext', 'beady.sortPickerEnabled', enabled);
  };

  const applyFavoritesContext = (): void => {
    const favoritesEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('favorites.enabled', false);
    void vscode.commands.executeCommand('setContext', 'beady.favoritesEnabled', favoritesEnabled);
  };

  const applyFeedbackContext = (): void => {
    const enablement = computeFeedbackEnablement();
    provider.setFeedbackEnabled(enablement.enabled);
    void vscode.commands.executeCommand('setContext', 'beady.feedbackEnabled', enablement.enabled);
  };

  applyWorkspaceContext();
  applyBulkActionsContext();
  applyQuickFiltersContext();
  applySortPickerContext();
  applyFavoritesContext();
  applyFeedbackContext();

  // Register provider disposal
  context.subscriptions.push({ dispose: () => provider.dispose() });

  // Activity Feed Provider
  const activityFeedProvider = new ActivityFeedTreeDataProvider(context, { watchManager });
  const activityFeedView = vscode.window.createTreeView('activityFeed', {
    treeDataProvider: activityFeedProvider,
  });
  const activityFeedStatus = activityFeedProvider.onHealthChanged((status) => {
    if (status.state === 'error') {
      activityFeedView.message = status.message ?? t('Activity feed refresh failed; retrying…');
    } else if (status.state === 'idle') {
      activityFeedView.message = t('Activity feed idle (polling every {0}s)', Math.max(1, Math.round(status.intervalMs / 1000)));
    } else {
      activityFeedView.message = undefined;
    }
  });
  context.subscriptions.push({ dispose: () => activityFeedProvider.dispose() });

  const openActivityFeedEvent = async (issueId?: string): Promise<void> => {
    const selectedId =
      issueId ||
      activityFeedView.selection.find(
        (item): item is ActivityEventItem => item instanceof ActivityEventItem
      )?.event.issueId;

    if (!selectedId) {
      return;
    }

    await openBeadFromFeed(selectedId, provider);
  };

  // Register commands via command registry
  const commandRegistry = new CommandRegistry();
  commandRegistry.registerAll(createQuickFilterCommands(provider));
  commandRegistry.registerAll(createExportCommands(provider, treeView));
  context.subscriptions.push(...commandRegistry.getDisposables());

  // Register Chat Participants
  registerChatParticipants(context);

  context.subscriptions.push(
    treeView,
    dependencyTreeView,
    rowExpandOnSelect,
    dependencySelection,
    dependencySync,
    expandListener,
    collapseListener,
    activityFeedView,
    activityFeedStatus,
    vscode.commands.registerCommand('beady.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beady.search', () => provider.search()),
    vscode.commands.registerCommand('beady.clearSearch', () => provider.clearSearch()),
    vscode.commands.registerCommand('beady.clearSortOrder', () => provider.clearSortOrder()),
    // Quick filter commands now registered via commandRegistry above
    vscode.commands.registerCommand('beady.toggleClosedVisibility', () => provider.toggleClosedVisibility()),
    vscode.commands.registerCommand('beady.openBead', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      if (resolved) {
        return openBead(resolved, provider);
      }
    }),
    vscode.commands.registerCommand('beady.createBead', () => createBead()),
    vscode.commands.registerCommand('beady.selectWorkspace', () => selectWorkspace(provider)),
    vscode.commands.registerCommand('beady.addDependency', (item?: BeadItemData) => addDependencyCommand(provider, item)),
    vscode.commands.registerCommand('beady.removeDependency', (item?: BeadItemData) => removeDependencyCommand(provider, undefined, { contextId: item?.id })),
    vscode.commands.registerCommand('beady.dependencyTree.pickRoot', async () => {
      const root = await pickBeadQuick(provider['items'] as BeadItemData[] | undefined, t('Select issue for dependency tree'));
      if (root) {
        dependencyTreeProvider.setRoot(root.id);
      }
    }),
    vscode.commands.registerCommand('beady.dependencyTree.addUpstream', async () => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
        return;
      }
      const rootId = dependencyTreeProvider.getRootId();
      const items = provider['items'] as BeadItemData[] | undefined;
      const root = items?.find((i) => i.id === rootId);
      if (!root) {
        void vscode.window.showWarningMessage(t('Select an issue to edit dependencies.'));
        return;
      }
      const target = await pickBeadQuick(items, t('Select an upstream dependency'), root.id);
      if (!target) {
        return;
      }
      await addDependencyCommand(provider, root, { sourceId: root.id, targetId: target.id });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.dependencyTree.addDownstream', async () => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
        return;
      }
      const rootId = dependencyTreeProvider.getRootId();
      const items = provider['items'] as BeadItemData[] | undefined;
      const root = items?.find((i) => i.id === rootId);
      if (!root) {
        void vscode.window.showWarningMessage(t('Select an issue to edit dependencies.'));
        return;
      }
      const dependent = await pickBeadQuick(items, t('Select an issue that should depend on {0}', root.id), root.id);
      if (!dependent) {
        return;
      }
      await addDependencyCommand(provider, dependent, { sourceId: dependent.id, targetId: root.id });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.dependencyTree.remove', async (node?: any) => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
        return;
      }
      if (!node || !node.sourceId || !node.targetId) {
        return;
      }
      await removeDependencyCommand(provider, { sourceId: node.sourceId, targetId: node.targetId }, { contextId: dependencyTreeProvider.getRootId() });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.visualizeDependencies', () => visualizeDependencies(provider)),
    // Export commands now registered via commandRegistry above
    vscode.commands.registerCommand('beady.bulkUpdateStatus', () => bulkUpdateStatus(provider, treeView, runBdCommand)),
    vscode.commands.registerCommand('beady.bulkAddLabel', () => bulkUpdateLabel(provider, treeView, 'add', runBdCommand)),
    vscode.commands.registerCommand('beady.bulkRemoveLabel', () => bulkUpdateLabel(provider, treeView, 'remove', runBdCommand)),
    vscode.commands.registerCommand('beady.toggleFavorite', () => toggleFavorites(provider, treeView, context, runBdCommand)),
    vscode.commands.registerCommand('beady.inlineStatusChange', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      if (resolved) {
        return inlineStatusQuickChange(provider as any, treeView, activityFeedView, runBdCommand);
      }
      return inlineStatusQuickChange(provider as any, treeView, activityFeedView, runBdCommand);
    }),
    vscode.commands.registerCommand('beady.inlineEditTitle', () => inlineEditTitle(provider as any, treeView)),
    vscode.commands.registerCommand('beady.inlineEditLabels', () => inlineEditLabels(provider as any, treeView)),
    vscode.commands.registerCommand('beady.editAssignee', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      return editAssignee(provider as any, treeView, resolved);
    }),
    
    // Activity Feed commands
    vscode.commands.registerCommand('beady.refreshActivityFeed', () => activityFeedProvider.refresh('manual')),
    vscode.commands.registerCommand('beady.filterActivityFeed', async () => {
      const options: Array<vscode.QuickPickItem & { value: string }> = [
        { label: t('All Events'), description: t('Show all event types'), value: 'all' },
        { label: t('Created'), description: t('Show issue creation events'), value: 'created' },
        { label: t('Closed'), description: t('Show issue closed events'), value: 'closed' },
        { label: t('Status Changes'), description: t('Show status change events'), value: 'status' },
        { label: t('Dependencies'), description: t('Show dependency events'), value: 'dependencies' },
        { label: t('Today'), description: t('Show events from today'), value: 'today' },
        { label: t('This Week'), description: t('Show events from this week'), value: 'week' },
        { label: t('This Month'), description: t('Show events from this month'), value: 'month' },
      ];

      const selection = await vscode.window.showQuickPick(options, {
        placeHolder: t('Filter activity feed by...'),
      });

      if (!selection) {
        return;
      }

      switch (selection.value) {
        case 'all':
          activityFeedProvider.clearFilters();
          break;
        case 'created':
          activityFeedProvider.setEventTypeFilter(['created'] as EventType[]);
          break;
        case 'closed':
          activityFeedProvider.setEventTypeFilter(['closed'] as EventType[]);
          break;
        case 'status':
          activityFeedProvider.setEventTypeFilter(['status_changed'] as EventType[]);
          break;
        case 'dependencies':
          activityFeedProvider.setEventTypeFilter(['dependency_added', 'dependency_removed'] as EventType[]);
          break;
        case 'today':
          activityFeedProvider.setTimeRangeFilter('today');
          break;
        case 'week':
          activityFeedProvider.setTimeRangeFilter('week');
          break;
        case 'month':
          activityFeedProvider.setTimeRangeFilter('month');
          break;
      }
    }),
    vscode.commands.registerCommand('beady.clearActivityFeedFilter', () => {
      activityFeedProvider.clearFilters();
      void vscode.window.showInformationMessage(t('Activity feed filter cleared'));
    }),
    vscode.commands.registerCommand('beady.activityFeed.openEvent', (issueId?: string) => openActivityFeedEvent(issueId)),
    vscode.commands.registerCommand('beady.activityFeed.openSelected', () => openActivityFeedEvent()),
    vscode.commands.registerCommand('beady.openActivityFeedPanel', () => 
      openActivityFeedPanel(activityFeedProvider, provider)
    ),
    vscode.commands.registerCommand('beady.openInProgressPanel', () => openInProgressPanel(provider)),

    vscode.commands.registerCommand('beady.editExternalReference', async (item: BeadItemData) => {
      if (!item) {
        return;
      }

      // Construct the current value from ID and description
      const currentValue = item.externalReferenceId
        ? (item.externalReferenceDescription
          ? `${item.externalReferenceId}:${item.externalReferenceDescription}`
          : item.externalReferenceId)
        : '';

      const newValue = await vscode.window.showInputBox({
        prompt: t('Set the external reference for this bead (format: ID:description)'),
        value: currentValue,
        placeHolder: t('Enter "ID:description" or leave empty to remove'),
      });

      if (newValue === undefined) {
        return;
      }

      await provider.updateExternalReference(item, newValue.trim().length > 0 ? newValue.trim() : undefined);
    }),
    vscode.commands.registerCommand('beady.deleteBeads', async () => {
      // Get selected items from tree view
      const selection = treeView.selection;

      if (!selection || selection.length === 0) {
        void vscode.window.showWarningMessage(t('No beads selected'));
        return;
      }
      
      // Filter for BeadTreeItems only (not StatusSectionItems)
      const beadItems = selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
      if (beadItems.length === 0) {
        void vscode.window.showWarningMessage(t('No beads selected (only status sections selected)'));
        return;
      }

      // Build confirmation message with list of beads
      const beadsList = beadItems
        .map(item => `  • ${item.bead.id} - ${item.bead.title}`)
        .join('\n');

      const message = beadItems.length === 1
        ? t('Are you sure you want to delete this bead?\n\n{0}', beadsList)
        : t('Are you sure you want to delete these {0} beads?\n\n{1}', beadItems.length, beadsList);

      const deleteLabel = t('Delete');

      // Show confirmation dialog
      const answer = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        deleteLabel
      );

      if (answer !== deleteLabel) {
        return;
      }

      // Delete each bead
      const config = vscode.workspace.getConfiguration('beady');
      const projectRoot = resolveProjectRoot(config) || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());

      try {
        // Delete beads one by one with guard
        for (const item of beadItems) {
          await runBdCommand(['delete', item.bead.id, '--force'], projectRoot!);
        }

        await provider.refresh();

        const successMessage = beadItems.length === 1
          ? t('Deleted bead: {0}', beadItems[0].bead.id)
          : t('Deleted {0} beads', beadItems.length);
        void vscode.window.showInformationMessage(successMessage);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(t('Failed to delete beads: {0}', errorMessage));
      }
    }),
    registerSendFeedbackCommand(context),
  );

  // If dependency editing is enabled, warn early when the bd CLI is too old
  const workspaces = vscode.workspace.workspaceFolders ?? [];
  workspaces.forEach((workspaceFolder) => {
    void warnIfDependencyEditingUnsupported(workspaceFolder);
  });

  const configurationWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('beady.enableDependencyEditing')) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      folders.forEach((workspaceFolder) => {
        void warnIfDependencyEditingUnsupported(workspaceFolder);
      });
    }

    if (event.affectsConfiguration('beady.bulkActions')) {
      applyBulkActionsContext();
    }

    if (event.affectsConfiguration('beady.favorites')) {
      applyFavoritesContext();
      void provider.refresh();
    }

    if (event.affectsConfiguration('beady.quickFilters')) {
      applyQuickFiltersContext();
    }

    if (event.affectsConfiguration('beady.sortPicker')) {
      applySortPickerContext();
    }

    if (event.affectsConfiguration('beady.feedback') || event.affectsConfiguration('beady.projectRoot')) {
      applyFeedbackContext();
    }
  });

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    applyFeedbackContext();
    applyBulkActionsContext();
    applyQuickFiltersContext();
    applyWorkspaceContext();
    provider.handleWorkspaceFoldersChanged();
  });

  context.subscriptions.push(configurationWatcher, workspaceWatcher);

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
