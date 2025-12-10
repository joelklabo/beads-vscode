import * as vscode from 'vscode';
import { ActivityFeedTreeDataProvider } from '../activityFeedProvider';
import { DependencyTreeProvider } from '../dependencyTreeProvider';
import { BeadsTreeDataProvider, TreeItemType } from '../providers/beads/treeDataProvider';
import { WatcherManager } from '../providers/beads/store';
import { BeadItemData } from '../utils';

/**
 * Shared activation contracts used to type orchestration helpers without
 * coupling to implementation details.
 */

export interface ActivationContext {
  provider: BeadsTreeDataProvider;
  treeView: vscode.TreeView<TreeItemType>;
  dependencyTreeProvider: DependencyTreeProvider;
  dependencyTreeView: vscode.TreeView<unknown>;
  activityFeedProvider: ActivityFeedTreeDataProvider;
  activityFeedView: vscode.TreeView<vscode.TreeItem>;
}

export interface ViewRegistryResult
  extends Pick<ActivationContext, 'provider' | 'treeView' | 'dependencyTreeProvider' | 'dependencyTreeView'> {}

export interface ActivityFeedRegistryResult
  extends Pick<ActivationContext, 'activityFeedProvider' | 'activityFeedView'> {}

export type ViewRegistryFactory = (
  context: vscode.ExtensionContext,
  watchManager: WatcherManager
) => ViewRegistryResult;

export type ActivityFeedRegistryFactory = (
  context: vscode.ExtensionContext,
  watchManager: WatcherManager,
  beadsProvider: BeadsTreeDataProvider
) => ActivityFeedRegistryResult;

export type CommandResolver = (item: unknown, provider: BeadsTreeDataProvider) => BeadItemData | undefined;
export type BeadPicker = (
  items: BeadItemData[] | undefined,
  placeholder: string,
  excludeId?: string
) => Promise<BeadItemData | undefined>;

export interface PanelOpeners {
  openBead: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void>;
  openBeadFromFeed: (
    selectedId: string,
    provider: BeadsTreeDataProvider,
    opener?: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void>
  ) => Promise<boolean>;
  openActivityFeedPanel: (deps: {
    activityFeedProvider: ActivityFeedTreeDataProvider;
    beadsProvider: BeadsTreeDataProvider;
    openBead: (item: BeadItemData) => Promise<void>;
    locale?: string;
  }) => Promise<void>;
  openInProgressPanel: (deps: {
    provider: BeadsTreeDataProvider;
    openBead: (item: BeadItemData) => Promise<void>;
    locale?: string;
  }) => Promise<void>;
  visualizeDependencies: (provider: BeadsTreeDataProvider) => Promise<void>;
}

export type CommandRegistrar = (
  context: vscode.ExtensionContext,
  activationContext: ActivationContext,
  resolveCommandItem: CommandResolver,
  openBead: PanelOpeners['openBead'],
  openBeadFromFeed: PanelOpeners['openBeadFromFeed'],
  openActivityFeedPanel: PanelOpeners['openActivityFeedPanel'],
  openInProgressPanel: PanelOpeners['openInProgressPanel'],
  pickBeadQuick: BeadPicker,
  visualizeDependencies: PanelOpeners['visualizeDependencies']
) => void;

export type ConfigurationWatcher = (
  context: vscode.ExtensionContext,
  provider: BeadsTreeDataProvider
) => void;

export interface ContextStateManager {
  applyWorkspaceContext(provider: BeadsTreeDataProvider): void;
  applyBulkActionsContext(): void;
  applyQuickFiltersContext(provider: BeadsTreeDataProvider): void;
  applySortPickerContext(provider: BeadsTreeDataProvider): void;
  applyFavoritesContext(): void;
  applyFeedbackContext(provider: BeadsTreeDataProvider): void;
}
