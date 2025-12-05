import * as vscode from 'vscode';
import * as path from 'path';
import { currentWorktreeId } from '../../worktree';
import { formatError } from '../../utils';
import {
  ActivityEventItem,
  ActivityTreeItem,
  createStatisticItems,
  createTimeGroups,
  StatisticsSectionItem,
  TimeGroupItem,
} from './items';
import ActivityFeedStore, { TimeRange } from './store';

export class ActivityFeedTreeDataProvider implements vscode.TreeDataProvider<ActivityTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ActivityTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly store = new ActivityFeedStore();
  private debounceTimer: NodeJS.Timeout | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watcherSubscriptions: vscode.Disposable[] = [];
  private collapsedGroups: Set<string> = new Set();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSettings();
    this.setupFileWatcher();
  }

  getTreeItem(element: ActivityTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ActivityTreeItem): Promise<ActivityTreeItem[]> {
    if (element instanceof StatisticsSectionItem) {
      return createStatisticItems(element.statistics);
    }

    if (element instanceof TimeGroupItem) {
      return element.events.map((event) => new ActivityEventItem(event, event.worktreeId));
    }

    if (element) {
      return [];
    }

    if (this.store.getEvents().length === 0) {
      await this.refresh();
    }

    const items: ActivityTreeItem[] = [];
    const events = this.store.getEvents();

    if (events.length > 0) {
      items.push(new StatisticsSectionItem(this.store.getStatistics()));
    }

    const grouped = this.store.getGroupedEvents();
    items.push(...createTimeGroups(grouped, this.collapsedGroups));
    return items;
  }

  async refresh(): Promise<void> {
    try {
      const projectRoot = this.resolveProjectRoot();
      this.store.setWorktreeId(currentWorktreeId(projectRoot || ''));
      await this.store.refresh(projectRoot);
      this.onDidChangeTreeDataEmitter.fire();
    } catch (error) {
      console.error('Failed to refresh activity feed:', error);
      void vscode.window.showErrorMessage(formatError('Failed to load activity feed', error));
    }
  }

  toggleGroupCollapse(groupName: string): void {
    if (this.collapsedGroups.has(groupName)) {
      this.collapsedGroups.delete(groupName);
    } else {
      this.collapsedGroups.add(groupName);
    }
    this.saveSettings();
    this.onDidChangeTreeDataEmitter.fire();
  }

  setEventTypeFilter(types: import('../../activityFeed').EventType[] | undefined): void {
    this.store.setEventTypeFilter(types);
    void this.refresh();
  }

  setIssueFilter(issueId: string | undefined): void {
    this.store.setIssueFilter(issueId);
    void this.refresh();
  }

  setTimeRangeFilter(range: TimeRange): void {
    this.store.setTimeRangeFilter(range);
    void this.refresh();
  }

  clearFilters(): void {
    this.store.clearFilters();
    void this.refresh();
  }

  async loadMoreEvents(): Promise<void> {
    const projectRoot = this.resolveProjectRoot();
    await this.store.loadMore(projectRoot);
    this.onDidChangeTreeDataEmitter.fire();
  }

  getStats(): { total: number; byType: Record<string, number> } {
    return this.store.getStatsSummary();
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    for (const subscription of this.watcherSubscriptions) {
      subscription.dispose();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.refresh();
    }, 500);
  }

  private setupFileWatcher(): void {
    const projectRoot = this.resolveProjectRoot();
    if (!projectRoot) {
      return;
    }

    try {
      const dbPath = vscode.Uri.joinPath(vscode.Uri.file(projectRoot), '.beads');
      const pattern = new vscode.RelativePattern(dbPath.fsPath, '*.db');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      const onChange = watcher.onDidChange(() => this.debouncedRefresh());
      const onCreate = watcher.onDidCreate(() => this.debouncedRefresh());

      this.context.subscriptions.push(watcher, onChange, onCreate);
      this.fileWatcher = watcher;
      this.watcherSubscriptions = [onChange, onCreate];
    } catch (error) {
      console.warn('Failed to setup file watcher for activity feed:', error);
    }
  }

  private resolveProjectRoot(): string | undefined {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRootConfig = config.get<string>('projectRoot');

    if (projectRootConfig && projectRootConfig.trim().length > 0) {
      if (path.isAbsolute(projectRootConfig)) {
        return projectRootConfig;
      }
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        return path.join(workspaceFolders[0].uri.fsPath, projectRootConfig);
      }
      return undefined;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }

    return undefined;
  }

  private loadSettings(): void {
    const collapsed = this.context.workspaceState.get<string[]>('activityFeed.collapsedGroups');
    if (collapsed) {
      this.collapsedGroups = new Set(collapsed);
    }
  }

  private saveSettings(): void {
    void this.context.workspaceState.update('activityFeed.collapsedGroups', Array.from(this.collapsedGroups));
  }
}

export default ActivityFeedTreeDataProvider;
