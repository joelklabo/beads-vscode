import * as vscode from 'vscode';
import * as path from 'path';
import { WatcherManager } from '@beads/core';
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

export interface ActivityFeedProviderOptions {
  baseIntervalMs?: number;
  maxIntervalMs?: number;
  idleBackoffStepMs?: number;
  enableAutoRefresh?: boolean;
  watchManager?: WatcherManager;
}

export type ActivityFeedHealth =
  | { state: 'ok'; intervalMs: number }
  | { state: 'idle'; intervalMs: number }
  | { state: 'error'; intervalMs: number; message?: string };

export class ActivityFeedTreeDataProvider implements vscode.TreeDataProvider<ActivityTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ActivityTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly onHealthChangedEmitter = new vscode.EventEmitter<ActivityFeedHealth>();
  readonly onHealthChanged = this.onHealthChangedEmitter.event;

  private readonly store = new ActivityFeedStore();
  private debounceTimer: NodeJS.Timeout | undefined;
  private watchSubscription: { dispose(): void } | undefined;
  private collapsedGroups: Set<string> = new Set();
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly idleBackoffStepMs: number;
  private currentIntervalMs: number;
  private lastEventCount = 0;
  private lastNewestTimestamp = 0;
  private autoRefreshEnabled: boolean;
  private readonly watchManager?: WatcherManager;

  constructor(private readonly context: vscode.ExtensionContext, options: ActivityFeedProviderOptions = {}) {
    this.baseIntervalMs = options.baseIntervalMs ?? 30000;
    this.maxIntervalMs = options.maxIntervalMs ?? 120000;
    this.idleBackoffStepMs = options.idleBackoffStepMs ?? 15000;
    this.currentIntervalMs = this.baseIntervalMs;
    this.autoRefreshEnabled = options.enableAutoRefresh !== false;
    this.watchManager = options.watchManager;
    this.loadSettings();
    this.setupFileWatcher();
    if (this.autoRefreshEnabled) {
      this.scheduleNextRefresh(0);
    }
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

  async refresh(reason: 'manual' | 'auto' = 'manual'): Promise<void> {
    try {
      const projectRoot = this.resolveProjectRoot();
      if (reason === 'manual') {
        this.currentIntervalMs = this.baseIntervalMs;
      }

      this.store.setWorktreeId(currentWorktreeId(projectRoot || ''));
      await this.store.refresh(projectRoot);

      const events = this.store.getEvents();
      const newest = events[0]?.createdAt?.getTime() ?? 0;
      const eventsChanged = events.length !== this.lastEventCount || newest !== this.lastNewestTimestamp;

      this.lastEventCount = events.length;
      this.lastNewestTimestamp = newest;

      this.onDidChangeTreeDataEmitter.fire();
      this.handleRefreshSuccess(eventsChanged);
    } catch (error) {
      console.error('Failed to refresh activity feed:', error);
      if (reason === 'manual') {
        void vscode.window.showErrorMessage(formatError('Failed to load activity feed', error));
      }
      this.handleRefreshFailure(error);
    } finally {
      if (reason === 'auto' || this.autoRefreshEnabled) {
        this.scheduleNextRefresh();
      }
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
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    if (this.watchSubscription) {
      this.watchSubscription.dispose();
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

  private scheduleNextRefresh(delay?: number): void {
    if (!this.autoRefreshEnabled) {
      return;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    const waitMs = delay ?? this.currentIntervalMs;
    this.refreshTimer = setTimeout(() => {
      void this.refresh('auto');
    }, waitMs);
  }

  private handleRefreshSuccess(eventsChanged: boolean): void {
    this.currentIntervalMs = eventsChanged
      ? this.baseIntervalMs
      : Math.min(this.maxIntervalMs, this.currentIntervalMs + this.idleBackoffStepMs);

    this.onHealthChangedEmitter.fire({
      state: eventsChanged ? 'ok' : 'idle',
      intervalMs: this.currentIntervalMs,
    });
  }

  private handleRefreshFailure(error: unknown): void {
    this.currentIntervalMs = Math.min(this.maxIntervalMs, Math.max(this.baseIntervalMs, this.currentIntervalMs * 2));
    const message = formatError('Failed to load activity feed', error);
    console.warn(message);
    this.onHealthChangedEmitter.fire({
      state: 'error',
      intervalMs: this.currentIntervalMs,
      message,
    });
    void vscode.window.setStatusBarMessage(message, 5000);
  }

  private setupFileWatcher(): void {
    const projectRoot = this.resolveProjectRoot();
    if (!projectRoot) {
      return;
    }

    if (this.watchManager) {
      this.watchSubscription?.dispose();
      const dbPath = path.join(projectRoot, '.beads');
      this.watchSubscription = this.watchManager.watch(dbPath, () => this.debouncedRefresh());
      return;
    }

    try {
      const dbPath = vscode.Uri.joinPath(vscode.Uri.file(projectRoot), '.beads');
      const pattern = new vscode.RelativePattern(dbPath.fsPath, '*.db');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = watcher.onDidChange(() => this.debouncedRefresh());
      const onCreate = watcher.onDidCreate(() => this.debouncedRefresh());

      this.context.subscriptions.push(watcher, onChange, onCreate);
      this.watchSubscription = {
        dispose: () => {
          watcher.dispose();
          onChange.dispose();
          onCreate.dispose();
        },
      };
    } catch (error) {
      console.warn('Failed to setup file watcher for activity feed:', error);
    }
  }

  private resolveProjectRoot(): string | undefined {
    const config = vscode.workspace.getConfiguration('beady');
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
