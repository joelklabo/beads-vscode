import * as vscode from 'vscode';
import { ActivityFeedTreeDataProvider } from './activityFeedProvider';
import { BeadsTreeDataProvider } from './providers/beads/treeDataProvider';
import { BeadTreeItem, EpicTreeItem, UngroupedSectionItem } from './providers/beads/items';
import { WatcherManager, createVsCodeWatchAdapter, findBdCommand } from './providers/beads/store';
import { createDependencyGraphView } from './views/graph';
import { openActivityFeedPanel } from './views/panels/activityFeedPanel';
import { openInProgressPanel } from './views/panels/inProgressPanel';
import { openBeadPanel, openBeadFromFeed as openBeadFromFeedPanel } from './views/detail/panel';
import { setupProviders, setupActivityFeed, registerCommands, setupConfigurationWatchers } from './activation';
import { addDependencyCommand, removeDependencyCommand } from './commands/dependencies';
import {
  bulkUpdateLabel,
  bulkUpdateStatus,
  inlineEditLabels,
  inlineEditTitle,
  inlineStatusQuickChange,
  toggleFavorites,
} from './commands';
import { currentWorktreeId } from './worktree';
import { formatBdError, resolveBeadId, runBdCommand } from './services/cliService';
import { BeadItemData, collectDependencyEdges, deriveAssigneeName, formatSafeError } from './utils';

const t = vscode.l10n.t;

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

const openBead = (item: BeadItemData, provider: BeadsTreeDataProvider): Promise<void> =>
  openBeadPanel(item, provider, openBead);

const openBeadFromFeed = (
  issueId: string,
  beadsProvider: BeadsTreeDataProvider,
  opener: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void> = openBead
): Promise<boolean> => openBeadFromFeedPanel(issueId, beadsProvider, opener);

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

async function visualizeDependencies(provider: BeadsTreeDataProvider): Promise<void> {
  createDependencyGraphView({
    getItems: () => provider['items'] as BeadItemData[],
    openBead: async (bead) => openBead(bead, provider),
    addDependency: async (sourceId, targetId) => {
      await addDependencyCommand(provider as any, undefined, { sourceId, targetId });
    },
    removeDependency: async (sourceId, targetId, contextId) => {
      await removeDependencyCommand(
        provider as any,
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
  formatBdError,
  resolveBeadId,
  addDependencyCommand,
  collectDependencyEdges,
  inlineStatusQuickChange,
  inlineEditTitle,
  inlineEditLabels,
  deriveAssigneeName,
  bulkUpdateStatus,
  bulkUpdateLabel,
};
