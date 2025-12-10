import * as vscode from 'vscode';
import { ActivityEventItem } from '../activityFeedProvider';
import { DependencyTreeProvider } from '../dependencyTreeProvider';
import { BeadTreeItem } from '../providers/beads/items';
import { BeadItemData } from '../utils';
import { resolveProjectRoot } from '../utils/workspace';
import { EventType } from '../activityFeed';
import {
  CommandDefinition,
  CommandRegistry,
  createBulkCommands,
  createCoreBeadsCommands,
  createDependencyCommands,
  createExportCommands,
  createFavoritesCommands,
  createInlineEditCommands,
  createQuickFilterCommands,
  selectWorkspace,
} from '../commands';
import { registerChatParticipants } from '../chatAgents';
import { addDependencyCommand, removeDependencyCommand } from '../commands/dependencies';
import { runBdCommand } from '../services/cliService';
import { registerSendFeedbackCommand } from '../commands/sendFeedback';
import type { CoreBeadsProvider } from '../commands';
import type { ActivityFeedTreeDataProvider } from '../activityFeedProvider';
import type { BeadsTreeDataProvider } from '../providers/beads/treeDataProvider';
import type { BeadPicker, CommandRegistrar, CommandResolver, PanelOpeners } from './contracts';

const t = vscode.l10n.t;

type DependencyTreeDeps = {
  provider: BeadsTreeDataProvider;
  dependencyTreeProvider: DependencyTreeProvider;
  pickBeadQuick: BeadPicker;
  visualizeDependencies: PanelOpeners['visualizeDependencies'];
};

function registerDependencyTreeCommands({
  provider,
  dependencyTreeProvider,
  pickBeadQuick,
  visualizeDependencies,
}: DependencyTreeDeps): CommandDefinition[] {
  return [
    {
      id: 'beady.dependencyTree.pickRoot',
      handler: async () => {
        const root = await pickBeadQuick(
          provider['items'] as BeadItemData[] | undefined,
          t('Select issue for dependency tree')
        );
        if (root) {
          dependencyTreeProvider.setRoot(root.id);
        }
      },
    },
    {
      id: 'beady.dependencyTree.addUpstream',
      handler: async () => {
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
      },
    },
    {
      id: 'beady.dependencyTree.addDownstream',
      handler: async () => {
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
      },
    },
    {
      id: 'beady.dependencyTree.remove',
      handler: async (node?: any) => {
        const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
        if (!editingEnabled) {
          void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
          return;
        }
        if (!node || !node.sourceId || !node.targetId) {
          return;
        }
        await removeDependencyCommand(
          provider as any,
          { sourceId: node.sourceId, targetId: node.targetId },
          { contextId: dependencyTreeProvider.getRootId() }
        );
        dependencyTreeProvider.refresh();
      },
    },
    {
      id: 'beady.visualizeDependencies',
      handler: () => visualizeDependencies(provider),
    },
  ];
}

function registerActivityFeedCommands(
  activityFeedProvider: ActivityFeedTreeDataProvider,
  activityFeedView: vscode.TreeView<vscode.TreeItem>,
  openBead: PanelOpeners['openBead'],
  openBeadFromFeed: PanelOpeners['openBeadFromFeed'],
  openActivityFeedPanel: PanelOpeners['openActivityFeedPanel'],
  provider: BeadsTreeDataProvider
): CommandDefinition[] {
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

  return [
    {
      id: 'beady.refreshActivityFeed',
      handler: () => activityFeedProvider.refresh('manual'),
    },
    {
      id: 'beady.filterActivityFeed',
      handler: async () => {
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
      },
    },
    {
      id: 'beady.clearActivityFeedFilter',
      handler: () => {
        activityFeedProvider.clearFilters();
        void vscode.window.showInformationMessage(t('Activity feed filter cleared'));
      },
    },
    {
      id: 'beady.activityFeed.openEvent',
      handler: (...args: unknown[]) => openActivityFeedEvent(args[0] as string | undefined),
    },
    {
      id: 'beady.activityFeed.openSelected',
      handler: () => openActivityFeedEvent(),
    },
    {
      id: 'beady.openActivityFeedPanel',
      handler: () => openActivityFeedPanel({
        activityFeedProvider,
        beadsProvider: provider,
        openBead: (item: BeadItemData) => openBead(item, provider),
      }),
    },
  ];
}

function registerPanelCommands(
  provider: BeadsTreeDataProvider,
  openInProgressPanel: PanelOpeners['openInProgressPanel'],
  openBead: PanelOpeners['openBead']
): CommandDefinition[] {
  return [
    {
      id: 'beady.openInProgressPanel',
      handler: () => openInProgressPanel({
        provider,
        openBead: (item: BeadItemData) => openBead(item, provider),
      }),
    },
  ];
}

function registerExternalReferenceCommands(provider: BeadsTreeDataProvider): CommandDefinition[] {
  return [
    {
      id: 'beady.editExternalReference',
      handler: async (...args: unknown[]) => {
        const item = args[0] as BeadItemData | undefined;
        if (!item) {
          return;
        }

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
      },
    },
  ];
}

function registerDeletionCommands(provider: BeadsTreeDataProvider, treeView: vscode.TreeView<unknown>): CommandDefinition[] {
  return [
    {
      id: 'beady.deleteBeads',
      handler: async () => {
        const selection = treeView.selection;

        if (!selection || selection.length === 0) {
          void vscode.window.showWarningMessage(t('No beads selected'));
          return;
        }

        const beadItems = selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
        if (beadItems.length === 0) {
          void vscode.window.showWarningMessage(t('No beads selected (only status sections selected)'));
          return;
        }

        const beadsList = beadItems
          .map(item => `  • ${item.bead.id} - ${item.bead.title}`)
          .join('\n');

        const message = beadItems.length === 1
          ? t('Are you sure you want to delete this bead?\n\n{0}', beadsList)
          : t('Are you sure you want to delete these {0} beads?\n\n{1}', beadItems.length, beadsList);

        const deleteLabel = t('Delete');

        const answer = await vscode.window.showWarningMessage(
          message,
          { modal: true },
          deleteLabel
        );

        if (answer !== deleteLabel) {
          return;
        }

        const config = vscode.workspace.getConfiguration('beady');
        const projectRoot = resolveProjectRoot(config) || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());

        try {
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
      },
    },
  ];
}

/**
 * Register all extension commands through a single orchestrator.
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

  const coreProvider: CoreBeadsProvider = {
    refresh: () => provider.refresh(),
    search: () => provider.search(),
    clearSearch: () => provider.clearSearch(),
    clearSortOrder: () => provider.clearSortOrder(),
    toggleClosedVisibility: () => Promise.resolve(provider.toggleClosedVisibility()),
  };

  const commandRegistry = new CommandRegistry();

  const coreCommands: CommandDefinition[] = [
    ...createCoreBeadsCommands(coreProvider, runBdCommand),
    ...createDependencyCommands(provider as any),
    ...createBulkCommands(provider, treeView, runBdCommand),
    ...createInlineEditCommands(provider as any, treeView, activityFeedView, runBdCommand),
    ...createQuickFilterCommands(provider),
    ...createExportCommands(provider, treeView),
    ...createFavoritesCommands(provider, treeView, context, runBdCommand),
    ...registerDependencyTreeCommands({ provider, dependencyTreeProvider, pickBeadQuick, visualizeDependencies }),
    ...registerActivityFeedCommands(activityFeedProvider, activityFeedView, openBead, openBeadFromFeed, openActivityFeedPanel, provider),
    ...registerPanelCommands(provider, openInProgressPanel, openBead),
    ...registerExternalReferenceCommands(provider),
    ...registerDeletionCommands(provider, treeView),
    {
      id: 'beady.selectWorkspace',
      handler: () => selectWorkspace(provider),
    },
    {
      id: 'beady.openBead',
      handler: (item: any) => {
        const resolved = resolveCommandItem(item, provider);
        if (resolved) {
          return openBead(resolved, provider);
        }
      },
    },
  ];

  commandRegistry.registerAll(coreCommands);

  // Register Chat Participants
  registerChatParticipants(context);

  context.subscriptions.push(...commandRegistry.getDisposables(), registerSendFeedbackCommand(context));
};
