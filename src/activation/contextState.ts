import * as vscode from 'vscode';
import { getWorkspaceOptions } from '../utils/workspace';
import { getBulkActionsConfig } from '../utils/config';
import { computeFeedbackEnablement } from '../feedback/enablement';
import { warnIfDependencyEditingUnsupported } from '../services/runtimeEnvironment';
import type { BeadsTreeDataProvider } from '../providers/beads/treeDataProvider';
import type { ConfigurationWatcher, ContextStateManager } from './contracts';

/** Apply workspace context keys based on available folders and active selection. */
export function applyWorkspaceContext(provider: BeadsTreeDataProvider): void {
  const count = vscode.workspace.workspaceFolders?.length ?? 0;
  const options = getWorkspaceOptions(vscode.workspace.workspaceFolders);
  const active = options.find((opt) => opt.id === provider.getActiveWorkspaceId()) ?? options[0];
  void vscode.commands.executeCommand('setContext', 'beady.multiRootAvailable', count > 1);
  void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', active?.label ?? '');
}

/** Apply bulk actions enablement/max selection context keys. */
export function applyBulkActionsContext(): void {
  const bulkConfig = getBulkActionsConfig();
  void vscode.commands.executeCommand('setContext', 'beady.bulkActionsEnabled', bulkConfig.enabled);
  void vscode.commands.executeCommand('setContext', 'beady.bulkActionsMaxSelection', bulkConfig.maxSelection);
}

/** Apply quick filter enablement context and sync provider state. */
export function applyQuickFiltersContext(provider: BeadsTreeDataProvider): void {
  const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
  void vscode.commands.executeCommand('setContext', 'beady.quickFiltersEnabled', quickFiltersEnabled);
  provider.syncQuickFilterContext();
}

/** Apply sort picker enablement context and update provider. */
export function applySortPickerContext(provider: BeadsTreeDataProvider): void {
  const enabled = vscode.workspace.getConfiguration('beady').get<boolean>('sortPicker.enabled', true);
  provider.setSortPickerEnabled(enabled);
  void vscode.commands.executeCommand('setContext', 'beady.sortPickerEnabled', enabled);
}

/** Apply favorites enablement context. */
export function applyFavoritesContext(): void {
  const favoritesEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('favorites.enabled', false);
  void vscode.commands.executeCommand('setContext', 'beady.favoritesEnabled', favoritesEnabled);
}

/** Apply feedback enablement context and update provider. */
export function applyFeedbackContext(provider: BeadsTreeDataProvider): void {
  const enablement = computeFeedbackEnablement();
  provider.setFeedbackEnabled(enablement.enabled);
  void vscode.commands.executeCommand('setContext', 'beady.feedbackEnabled', enablement.enabled);
}

/**
 * Register configuration/workspace watchers that keep context keys and provider
 * state in sync. Returns disposables so callers can manage teardown.
 */
export const registerContextWatchers: ConfigurationWatcher = (context, provider) => {
  const disposables: vscode.Disposable[] = [];

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
  });
  disposables.push(configurationWatcher);

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    applyFeedbackContext(provider);
    applyBulkActionsContext();
    applyQuickFiltersContext(provider);
    applyWorkspaceContext(provider);
    provider.handleWorkspaceFoldersChanged();
  });
  disposables.push(workspaceWatcher);

  context.subscriptions.push(...disposables);
  return disposables;
};

export const contextStateManager: ContextStateManager = {
  applyWorkspaceContext,
  applyBulkActionsContext,
  applyQuickFiltersContext,
  applySortPickerContext,
  applyFavoritesContext,
  applyFeedbackContext,
};
