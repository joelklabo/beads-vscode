import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from '../providers/beads/treeDataProvider';
import { BeadTreeItem } from '../providers/beads/items';
import { DependencyTreeProvider } from '../dependencyTreeProvider';
import { BeadsWebviewProvider } from '../providers/beads/webview';
import { BeadItemData } from '../utils';
import { contextStateManager } from './contextState';
import type { ViewRegistryResult } from './contracts';
import type { WatcherManager } from '../providers/beads/store';

export interface ViewRegistrySetup extends ViewRegistryResult {
  disposables: vscode.Disposable[];
}

export function createViewRegistry(
  context: vscode.ExtensionContext,
  watchManager: WatcherManager
): ViewRegistrySetup {
  const provider = new BeadsTreeDataProvider(context, watchManager);
  if (!provider) {
    throw new Error('Beads tree provider failed to initialize');
  }

  const disposables: vscode.Disposable[] = [];

  const treeView = vscode.window.createTreeView('beadyExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    canSelectMany: true,
  });
  disposables.push(treeView);

  const webviewProvider = new BeadsWebviewProvider(context.extensionUri, provider);
  disposables.push(
    vscode.window.registerWebviewViewProvider(BeadsWebviewProvider.viewType, webviewProvider)
  );

  provider.setTreeView(treeView);

  const dependencyTreeProvider = new DependencyTreeProvider(() => provider['items'] as BeadItemData[] | undefined);
  const dependencyTreeView = vscode.window.createTreeView('beadyDependencyTree', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true,
  });
  disposables.push(dependencyTreeView);

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

  const expandListener = treeView.onDidExpandElement(event => {
    provider.handleCollapseChange(event.element, false);
  });
  const collapseListener = treeView.onDidCollapseElement(event => {
    provider.handleCollapseChange(event.element, true);
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  provider.setStatusBarItem(statusBarItem);
  disposables.push(statusBarItem);

  contextStateManager.applyWorkspaceContext(provider);
  contextStateManager.applyBulkActionsContext();
  contextStateManager.applyQuickFiltersContext(provider);
  contextStateManager.applySortPickerContext(provider);
  contextStateManager.applyFavoritesContext();
  contextStateManager.applyFeedbackContext(provider);

  disposables.push(
    { dispose: () => provider.dispose() },
    rowExpandOnSelect,
    dependencySelection,
    dependencySync,
    expandListener,
    collapseListener
  );

  return { provider, treeView, dependencyTreeProvider, dependencyTreeView, disposables };
}
