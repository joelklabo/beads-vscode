import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from './providers/beads/treeDataProvider';
import { WatcherManager } from './providers/beads/store';
import { getWorkspaceOptions, resolveProjectRoot } from './utils/workspace';
import { getBulkActionsConfig } from './utils/config';
import { computeFeedbackEnablement } from './feedback/enablement';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { ActivityFeedTreeDataProvider } from './activityFeedProvider';
import { BeadsWebviewProvider } from './providers/beads/webview';
import { BeadItemData } from './utils';
import { warnIfDependencyEditingUnsupported } from './services/runtimeEnvironment';
import type {
  ActivityFeedRegistryResult,
  ConfigurationWatcher,
  ContextStateManager,
  ViewRegistryResult,
} from './activation/contracts';
export { registerCommands } from './activation/commands';

const t = vscode.l10n.t;

/**
 * Set up the main providers (Beads tree, dependency tree, webview, status bar).
 */
export function setupProviders(
  context: vscode.ExtensionContext,
  watchManager: WatcherManager
): ViewRegistryResult {
  const provider = new BeadsTreeDataProvider(context, watchManager);
  if (!provider) {
    throw new Error('Beads tree provider failed to initialize');
  }

  const webviewProvider = new BeadsWebviewProvider(context.extensionUri, provider, () => provider.getDensity());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BeadsWebviewProvider.viewType, webviewProvider)
  );

  const dependencyTreeProvider = new DependencyTreeProvider(() => provider['items'] as BeadItemData[] | undefined);
  const dependencyTreeView = vscode.window.createTreeView('beadyDependencyTree', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true,
  });

  const dependencySync = provider.onDidChangeTreeData(() => {
    dependencyTreeProvider.refresh();
    const items = provider['items'] as BeadItemData[] | undefined;
    if (!dependencyTreeProvider.getRootId() && items && items.length > 0) {
      dependencyTreeProvider.setRoot(items[0].id);
    }
  });

  // Create and register status bar item for stale count
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  provider.setStatusBarItem(statusBarItem);
  context.subscriptions.push(statusBarItem);

  // Apply initial context
  applyWorkspaceContext(provider);
  applyBulkActionsContext();
  applyQuickFiltersContext(provider);
  applySortPickerContext(provider);
  applyFavoritesContext();
  applyFeedbackContext(provider);

  // Register provider disposal
  context.subscriptions.push(
    { dispose: () => provider.dispose() },
    dependencyTreeView,
    dependencySync
  );

  return { provider, dependencyTreeProvider, dependencyTreeView };
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
 * Set up configuration and workspace watchers.
 */
export const setupConfigurationWatchers: ConfigurationWatcher = (context, provider) => {
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
      applyQuickFiltersContext(provider);
    }

    if (event.affectsConfiguration('beady.sortPicker')) {
      applySortPickerContext(provider);
    }

    if (event.affectsConfiguration('beady.feedback') || event.affectsConfiguration('beady.projectRoot')) {
      applyFeedbackContext(provider);
    }

    if (event.affectsConfiguration('beady.density')) {
      const value = vscode.workspace.getConfiguration('beady').get<string>('density', 'default');
      void provider.setDensity(value === 'compact' ? 'compact' : 'default');
    }
  });

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    applyFeedbackContext(provider);
    applyBulkActionsContext();
    applyQuickFiltersContext(provider);
    applyWorkspaceContext(provider);
    provider.handleWorkspaceFoldersChanged();
  });

  context.subscriptions.push(configurationWatcher, workspaceWatcher);
};

export const contextStateManager: ContextStateManager = {
  applyWorkspaceContext,
  applyBulkActionsContext,
  applyQuickFiltersContext,
  applySortPickerContext,
  applyFavoritesContext,
  applyFeedbackContext,
};

// Context application helpers

function applyWorkspaceContext(provider: BeadsTreeDataProvider): void {
  const count = vscode.workspace.workspaceFolders?.length ?? 0;
  const options = getWorkspaceOptions(vscode.workspace.workspaceFolders);
  const active = options.find((opt) => opt.id === provider.getActiveWorkspaceId()) ?? options[0];
  void vscode.commands.executeCommand('setContext', 'beady.multiRootAvailable', count > 1);
  void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', active?.label ?? '');
}

function applyBulkActionsContext(): void {
  const bulkConfig = getBulkActionsConfig();
  void vscode.commands.executeCommand('setContext', 'beady.bulkActionsEnabled', bulkConfig.enabled);
  void vscode.commands.executeCommand('setContext', 'beady.bulkActionsMaxSelection', bulkConfig.maxSelection);
}

function applyQuickFiltersContext(provider: BeadsTreeDataProvider): void {
  const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
  void vscode.commands.executeCommand('setContext', 'beady.quickFiltersEnabled', quickFiltersEnabled);
  provider.syncQuickFilterContext();
}

function applySortPickerContext(provider: BeadsTreeDataProvider): void {
  const enabled = vscode.workspace.getConfiguration('beady').get<boolean>('sortPicker.enabled', true);
  provider.setSortPickerEnabled(enabled);
  void vscode.commands.executeCommand('setContext', 'beady.sortPickerEnabled', enabled);
}

function applyFavoritesContext(): void {
  const favoritesEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('favorites.enabled', false);
  void vscode.commands.executeCommand('setContext', 'beady.favoritesEnabled', favoritesEnabled);
}

function applyFeedbackContext(provider: BeadsTreeDataProvider): void {
  const enablement = computeFeedbackEnablement();
  provider.setFeedbackEnabled(enablement.enabled);
  void vscode.commands.executeCommand('setContext', 'beady.feedbackEnabled', enablement.enabled);
}
