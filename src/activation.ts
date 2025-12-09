import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from './providers/beads/treeDataProvider';
import { BeadTreeItem } from './providers/beads/items';
import { WatcherManager } from './providers/beads/store';
import { resolveProjectRoot } from './utils/workspace';
import { ActivityFeedTreeDataProvider, ActivityEventItem } from './activityFeedProvider';
import { EventType } from './activityFeed';
import { BeadItemData } from './utils';
import { CommandRegistry, createQuickFilterCommands, createExportCommands } from './commands';
import { registerChatParticipants } from './chatAgents';
import { addDependencyCommand, removeDependencyCommand } from './commands/dependencies';
import { createBead } from './commands/beads';
import { selectWorkspace, bulkUpdateStatus, bulkUpdateLabel, toggleFavorites, inlineEditTitle, inlineEditLabels, inlineStatusQuickChange, editAssignee } from './commands';
import { registerSendFeedbackCommand } from './commands/sendFeedback';
import { runBdCommand } from './services/cliService';
import { registerContextWatchers } from './activation/contextState';
import { createViewRegistry } from './activation/viewRegistry';
import type {
  ActivityFeedRegistryResult,
  BeadPicker,
  CommandRegistrar,
  CommandResolver,
  ConfigurationWatcher,
  PanelOpeners,
  ViewRegistryResult,
} from './activation/contracts';

const t = vscode.l10n.t;

/**
 * Set up the main providers (Beads tree, dependency tree, webview, status bar).
 */
export function setupProviders(
  context: vscode.ExtensionContext,
  watchManager: WatcherManager
): ViewRegistryResult {
  const { disposables, ...result } = createViewRegistry(context, watchManager);
  context.subscriptions.push(...disposables);
  return result;
}

/**
 * Set up the activity feed provider and its tree view.
 */
export function setupActivityFeed(
  context: vscode.ExtensionContext,
  watchManager: WatcherManager,
  _beadsProvider: BeadsTreeDataProvider
): ActivityFeedRegistryResult {
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

  context.subscriptions.push(
    { dispose: () => activityFeedProvider.dispose() },
    activityFeedView,
    activityFeedStatus
  );

  return { activityFeedProvider, activityFeedView };
}

/**
 * Register all extension commands.
 */
export const registerCommands: CommandRegistrar = (
  context,
  activationContext,
  resolveCommandItem: CommandResolver,
  openBead: PanelOpeners['openBead'],
  openBeadFromFeed: PanelOpeners['openBeadFromFeed'],
  openActivityFeedPanel: PanelOpeners['openActivityFeedPanel'],
  openInProgressPanel: PanelOpeners['openInProgressPanel'],
  pickBeadQuick: BeadPicker,
  visualizeDependencies: PanelOpeners['visualizeDependencies']
): void => {
  const { provider, treeView, dependencyTreeProvider, activityFeedProvider, activityFeedView } = activationContext;

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
    vscode.commands.registerCommand('beady.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beady.search', () => provider.search()),
    vscode.commands.registerCommand('beady.clearSearch', () => provider.clearSearch()),
    vscode.commands.registerCommand('beady.clearSortOrder', () => provider.clearSortOrder()),
    vscode.commands.registerCommand('beady.toggleClosedVisibility', () => provider.toggleClosedVisibility()),
    vscode.commands.registerCommand('beady.openBead', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      if (resolved) {
        return openBead(resolved, provider);
      }
    }),
    vscode.commands.registerCommand('beady.createBead', () => createBead(runBdCommand)),
    vscode.commands.registerCommand('beady.selectWorkspace', () => selectWorkspace(provider)),
    vscode.commands.registerCommand('beady.addDependency', (item?: BeadItemData) => addDependencyCommand(provider as any, item)),
    vscode.commands.registerCommand('beady.removeDependency', (item?: BeadItemData) => removeDependencyCommand(provider as any, undefined, { contextId: item?.id })),
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
      await addDependencyCommand(provider as any, root, { sourceId: root.id, targetId: target.id });
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
      await addDependencyCommand(provider as any, dependent, { sourceId: dependent.id, targetId: root.id });
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
      await removeDependencyCommand(provider as any, { sourceId: node.sourceId, targetId: node.targetId }, { contextId: dependencyTreeProvider.getRootId() });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.visualizeDependencies', () => visualizeDependencies(provider)),
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
};

/**
 * Set up configuration and workspace watchers.
 */
export const setupConfigurationWatchers: ConfigurationWatcher = (context, provider) => {
  return registerContextWatchers(context, provider);
};
