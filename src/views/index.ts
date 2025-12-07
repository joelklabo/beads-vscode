/**
 * Views module barrel file.
 *
 * This module provides centralized view registration for the VS Code extension.
 * Instead of registering views directly in extension.main.ts, views are wired
 * through factory functions that return disposables.
 *
 * Usage:
 * ```ts
 * import { registerViews } from './views';
 *
 * export function activate(context: vscode.ExtensionContext): void {
 *   const disposables = registerViews(context, { provider, watchManager });
 *   context.subscriptions.push(...disposables);
 * }
 * ```
 */

// Re-export graph module for dependency visualization
export {
  createDependencyGraphView,
  refreshDependencyGraphView,
  buildDependencyTreeStrings,
  getStatusLabels,
  type GraphViewDependencies,
  type GraphViewResult,
  type StatusLabelMap,
} from './graph';

import * as vscode from 'vscode';
import type { BeadItemData } from '../utils';
import { BeadTreeItem } from '../providers/beads/items';
import type { WatcherManager } from '@beads/core';
import { DependencyTreeProvider } from '../dependencyTreeProvider';
import { ActivityFeedTreeDataProvider, ActivityEventItem } from '../activityFeedProvider';

const t = vscode.l10n.t;

/**
 * Interface for the beads tree data provider.
 * 
 * This interface allows the views module to work with the provider
 * without creating a circular dependency on extension.main.
 */
export interface BeadsTreeDataProviderLike extends vscode.TreeDataProvider<unknown>, vscode.TreeDragAndDropController<unknown> {
  /** Get the internal items array */
  readonly items?: BeadItemData[];
  /** Set the tree view reference */
  setTreeView(treeView: vscode.TreeView<unknown>): void;
  /** Set the status bar item */
  setStatusBarItem(item: vscode.StatusBarItem): void;
  /** Handle expand/collapse changes */
  handleCollapseChange(element: unknown, collapsed: boolean): void;
  /** Dispose the provider */
  dispose(): void;
  /** Tree data change event */
  onDidChangeTreeData: vscode.Event<unknown>;
}

/**
 * Dependencies required for view registration.
 */
export interface ViewDependencies {
  provider: BeadsTreeDataProviderLike;
  watchManager: WatcherManager;
  context: vscode.ExtensionContext;
}

/**
 * Result of view registration, containing references to views and disposables.
 */
export interface ViewRegistration {
  /** Main beads explorer tree view */
  treeView: vscode.TreeView<unknown>;
  /** Dependency tree view */
  dependencyTreeView: vscode.TreeView<unknown>;
  /** Activity feed tree view */
  activityFeedView: vscode.TreeView<vscode.TreeItem>;
  /** Activity feed provider for external access */
  activityFeedProvider: ActivityFeedTreeDataProvider;
  /** Dependency tree provider for external access */
  dependencyTreeProvider: DependencyTreeProvider;
  /** All disposables that should be added to context.subscriptions */
  disposables: vscode.Disposable[];
  /** Open a bead from the activity feed by ID */
  openActivityFeedEvent: (issueId?: string) => Promise<void>;
}

/**
 * Register the beads explorer tree view.
 *
 * Creates the main tree view with drag-and-drop support and multi-select.
 * Sets up expand/collapse tracking and status bar integration.
 */
function registerBeadsExplorer(
  provider: BeadsTreeDataProviderLike
): {
  treeView: vscode.TreeView<unknown>;
  expandListener: vscode.Disposable;
  collapseListener: vscode.Disposable;
  statusBarItem: vscode.StatusBarItem;
} {
  const treeView = vscode.window.createTreeView('beadyExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    canSelectMany: true,
  });

  // Set tree view reference for badge updates
  provider.setTreeView(treeView);

  // Track expand/collapse to update icons and persist state
  const expandListener = treeView.onDidExpandElement((event) => {
    provider.handleCollapseChange(event.element, false);
  });
  const collapseListener = treeView.onDidCollapseElement((event) => {
    provider.handleCollapseChange(event.element, true);
  });

  // Create status bar item for stale count
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  provider.setStatusBarItem(statusBarItem);

  return { treeView, expandListener, collapseListener, statusBarItem };
}

/**
 * Register the dependency tree view.
 *
 * Creates a tree view that shows dependency relationships for a selected bead.
 * Updates automatically when the main tree selection changes.
 */
function registerDependencyTree(
  provider: BeadsTreeDataProviderLike,
  treeView: vscode.TreeView<unknown>
): {
  dependencyTreeProvider: DependencyTreeProvider;
  dependencyTreeView: vscode.TreeView<unknown>;
  dependencySelection: vscode.Disposable;
  dependencySync: vscode.Disposable;
} {
  const dependencyTreeProvider = new DependencyTreeProvider(
    () => provider.items
  );

  const dependencyTreeView = vscode.window.createTreeView('beadyDependencyTree', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true,
  });

  // Sync dependency tree root with main tree selection
  const dependencySelection = treeView.onDidChangeSelection((event) => {
    const bead = event.selection.find(
      (item): item is BeadTreeItem => item instanceof BeadTreeItem
    );
    if (bead?.bead) {
      dependencyTreeProvider.setRoot(bead.bead.id);
    }
  });

  // Refresh dependency tree when main tree data changes
  const dependencySync = provider.onDidChangeTreeData(() => dependencyTreeProvider.refresh());

  return { dependencyTreeProvider, dependencyTreeView, dependencySelection, dependencySync };
}

/**
 * Register the activity feed tree view.
 *
 * Creates a tree view that shows recent activity events for the workspace.
 * Includes health status monitoring and automatic refresh.
 */
function registerActivityFeed(
  context: vscode.ExtensionContext,
  watchManager: WatcherManager
): {
  activityFeedProvider: ActivityFeedTreeDataProvider;
  activityFeedView: vscode.TreeView<vscode.TreeItem>;
  activityFeedStatus: vscode.Disposable;
} {
  const activityFeedProvider = new ActivityFeedTreeDataProvider(context, { watchManager });

  const activityFeedView = vscode.window.createTreeView('activityFeed', {
    treeDataProvider: activityFeedProvider,
  });

  // Show status messages based on health state
  const activityFeedStatus = activityFeedProvider.onHealthChanged((status) => {
    if (status.state === 'error') {
      activityFeedView.message = status.message ?? t('Activity feed refresh failed; retrying…');
    } else if (status.state === 'idle') {
      activityFeedView.message = t('Activity feed idle (polling every {0}s)', Math.max(1, Math.round(status.intervalMs / 1000)));
    } else {
      activityFeedView.message = undefined;
    }
  });

  return { activityFeedProvider, activityFeedView, activityFeedStatus };
}

/**
 * Create a function to open beads from the activity feed.
 *
 * Returns a function that can be used to open a bead from the activity feed
 * either by ID or by using the current selection.
 */
function createActivityFeedOpener(
  activityFeedView: vscode.TreeView<vscode.TreeItem>,
  openBeadFromFeed: (issueId: string) => Promise<boolean>
): (issueId?: string) => Promise<void> {
  return async (issueId?: string): Promise<void> => {
    const selectedId =
      issueId ||
      activityFeedView.selection.find(
        (item): item is ActivityEventItem => item instanceof ActivityEventItem
      )?.event.issueId;

    if (!selectedId) {
      return;
    }

    await openBeadFromFeed(selectedId);
  };
}

/**
 * Register all views for the extension.
 *
 * This is the main entry point for view registration. It creates all tree views,
 * sets up event listeners, and returns a registration object with references
 * to views and disposables.
 *
 * @param deps - Dependencies required for view registration
 * @param openBeadFromFeed - Function to open a bead from the activity feed
 * @returns ViewRegistration with views, providers, and disposables
 */
export function registerViews(
  deps: ViewDependencies,
  openBeadFromFeed: (issueId: string) => Promise<boolean>
): ViewRegistration {
  const { provider, watchManager, context } = deps;

  // Register beads explorer
  const { treeView, expandListener, collapseListener, statusBarItem } = registerBeadsExplorer(provider);

  // Register dependency tree
  const { dependencyTreeProvider, dependencyTreeView, dependencySelection, dependencySync } = registerDependencyTree(
    provider,
    treeView
  );

  // Register activity feed
  const { activityFeedProvider, activityFeedView, activityFeedStatus } = registerActivityFeed(context, watchManager);

  // Create activity feed opener
  const openActivityFeedEvent = createActivityFeedOpener(activityFeedView, openBeadFromFeed);

  // Collect all disposables
  const disposables: vscode.Disposable[] = [
    treeView,
    expandListener,
    collapseListener,
    statusBarItem,
    dependencyTreeView,
    dependencySelection,
    dependencySync,
    activityFeedView,
    activityFeedStatus,
    { dispose: () => provider.dispose() },
    { dispose: () => activityFeedProvider.dispose() },
  ];

  return {
    treeView,
    dependencyTreeView,
    activityFeedView,
    activityFeedProvider,
    dependencyTreeProvider,
    disposables,
    openActivityFeedEvent,
  };
}
