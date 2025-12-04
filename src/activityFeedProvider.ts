/**
 * Activity Feed Tree View Provider
 * 
 * Provides a tree view showing activity events from the beads database,
 * grouped by time period (Today, Yesterday, This Week, etc.) with rich
 * icons per event type and real-time refresh support.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  EventData,
  EventType,
  fetchEvents,
  FetchEventsOptions,
  groupEventsByTime,
  formatRelativeTimeDetailed,
} from './activityFeed';
import { formatError } from './utils';

/**
 * Time group section item for organizing events by time period
 */
export class TimeGroupItem extends vscode.TreeItem {
  public readonly events: EventData[];
  public readonly groupName: string;

  constructor(groupName: string, events: EventData[], isCollapsed: boolean = false) {
    super(
      groupName,
      isCollapsed
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded
    );

    this.groupName = groupName;
    this.events = events;
    this.contextValue = 'timeGroup';

    // Show event count as description
    this.description = `${events.length} event${events.length !== 1 ? 's' : ''}`;

    // Time-specific icons
    const iconMap: Record<string, string> = {
      'Today': 'calendar',
      'Yesterday': 'history',
      'This Week': 'calendar',
      'Last Week': 'calendar',
      'This Month': 'calendar',
      'Older': 'archive',
    };

    this.iconPath = new vscode.ThemeIcon(
      iconMap[groupName] || 'calendar',
      new vscode.ThemeColor('foreground')
    );

    this.tooltip = `${groupName}: ${events.length} event${events.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Activity event tree item with rich icons and formatting
 */
export class ActivityEventItem extends vscode.TreeItem {
  public readonly event: EventData;

  constructor(event: EventData) {
    super(event.description, vscode.TreeItemCollapsibleState.None);

    this.event = event;
    this.contextValue = 'activityEvent';

    // Show relative time as description
    this.description = formatRelativeTimeDetailed(event.createdAt);

    // Event-specific icon with color
    const iconColors: Record<string, string> = {
      'event-created': 'charts.yellow',
      'event-success': 'testing.iconPassed',
      'event-warning': 'charts.yellow',
      'event-info': 'charts.blue',
      'event-purple': 'charts.purple',
      'event-default': 'foreground',
    };

    this.iconPath = new vscode.ThemeIcon(
      event.iconName,
      new vscode.ThemeColor(iconColors[event.colorClass] || 'foreground')
    );

    // Rich tooltip
    this.tooltip = this.buildTooltip(event);

    // Command to navigate to the issue
    this.command = {
      command: 'beads.openBead',
      title: 'Open Issue',
      arguments: [{ id: event.issueId }],
    };
  }

  private buildTooltip(event: EventData): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`**${event.description}**\n\n`);
    md.appendMarkdown(`📋 Issue: \`${event.issueId}\`\n\n`);

    if (event.issueTitle) {
      md.appendMarkdown(`📝 ${event.issueTitle}\n\n`);
    }

    md.appendMarkdown(`👤 Actor: ${event.actor}\n\n`);
    md.appendMarkdown(`🕐 ${event.createdAt.toLocaleString()}\n`);

    return md;
  }
}

/**
 * Union type for tree items in the activity feed
 */
export type ActivityTreeItem = TimeGroupItem | ActivityEventItem;

/**
 * Tree data provider for the activity feed view
 */
export class ActivityFeedTreeDataProvider
  implements vscode.TreeDataProvider<ActivityTreeItem>
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ActivityTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private events: EventData[] = [];
  private groupedEvents: Map<string, EventData[]> = new Map();
  private refreshInProgress: boolean = false;
  private pendingRefresh: boolean = false;
  private debounceTimer: NodeJS.Timeout | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watcherSubscriptions: vscode.Disposable[] = [];

  // Filter settings
  private filterEventTypes: EventType[] | undefined;
  private filterIssueId: string | undefined;
  private filterTimeRange: 'today' | 'week' | 'month' | 'all' = 'all';
  
  // Collapsed sections
  private collapsedGroups: Set<string> = new Set();

  // Pagination
  private pageSize: number = 100;
  private currentPage: number = 0;
  private totalEvents: number = 0;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSettings();
    this.setupFileWatcher();
  }

  getTreeItem(element: ActivityTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ActivityTreeItem): Promise<ActivityTreeItem[]> {
    // If element is a TimeGroupItem, return its events
    if (element instanceof TimeGroupItem) {
      return element.events.map((event) => new ActivityEventItem(event));
    }

    // If element is an ActivityEventItem, it has no children
    if (element instanceof ActivityEventItem) {
      return [];
    }

    // Root level - return time groups
    if (this.events.length === 0) {
      await this.refresh();
    }

    return this.createTimeGroups();
  }

  private createTimeGroups(): TimeGroupItem[] {
    // Group events by time period
    this.groupedEvents = groupEventsByTime(this.events);

    // Define time group order
    const groupOrder = [
      'Today',
      'Yesterday',
      'This Week',
      'Last Week',
      'This Month',
      'Older',
    ];

    const groups: TimeGroupItem[] = [];

    for (const groupName of groupOrder) {
      const events = this.groupedEvents.get(groupName);
      if (events && events.length > 0) {
        const isCollapsed = this.collapsedGroups.has(groupName);
        groups.push(new TimeGroupItem(groupName, events, isCollapsed));
      }
    }

    return groups;
  }

  async refresh(): Promise<void> {
    if (this.refreshInProgress) {
      this.pendingRefresh = true;
      return;
    }

    this.refreshInProgress = true;

    try {
      const projectRoot = this.resolveProjectRoot();
      if (!projectRoot) {
        this.events = [];
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      // Build filter options
      const options: FetchEventsOptions = {
        limit: this.pageSize,
        offset: this.currentPage * this.pageSize,
        eventTypes: this.filterEventTypes,
        issueId: this.filterIssueId,
      };

      // Apply time range filter
      if (this.filterTimeRange !== 'all') {
        const now = new Date();
        switch (this.filterTimeRange) {
          case 'today':
            options.afterDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );
            break;
          case 'week':
            options.afterDate = new Date(
              now.getTime() - 7 * 24 * 60 * 60 * 1000
            );
            break;
          case 'month':
            options.afterDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              1
            );
            break;
        }
      }

      const result = await fetchEvents(projectRoot, options);
      this.events = result.events;
      this.totalEvents = result.totalCount;

      this.onDidChangeTreeDataEmitter.fire();
    } catch (error) {
      console.error('Failed to refresh activity feed:', error);
      void vscode.window.showErrorMessage(
        formatError('Failed to load activity feed', error)
      );
    } finally {
      this.refreshInProgress = false;

      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh();
      }
    }
  }

  /**
   * Debounced refresh for file watcher events
   */
  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.refresh();
    }, 500);
  }

  /**
   * Setup file watcher for real-time updates
   */
  private setupFileWatcher(): void {
    const projectRoot = this.resolveProjectRoot();
    if (!projectRoot) {
      return;
    }

    try {
      // Watch the .beads directory for database changes
      const dbPath = path.join(projectRoot, '.beads');
      const pattern = new vscode.RelativePattern(dbPath, '*.db');
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

  /**
   * Resolve the project root directory
   */
  private resolveProjectRoot(): string | undefined {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRootConfig = config.get<string>('projectRoot');

    if (projectRootConfig && projectRootConfig.trim().length > 0) {
      return projectRootConfig;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }

    return undefined;
  }

  /**
   * Load persisted settings
   */
  private loadSettings(): void {
    const collapsed = this.context.workspaceState.get<string[]>(
      'activityFeed.collapsedGroups'
    );
    if (collapsed) {
      this.collapsedGroups = new Set(collapsed);
    }
  }

  /**
   * Save settings
   */
  private saveSettings(): void {
    void this.context.workspaceState.update(
      'activityFeed.collapsedGroups',
      Array.from(this.collapsedGroups)
    );
  }

  /**
   * Toggle group collapse state
   */
  toggleGroupCollapse(groupName: string): void {
    if (this.collapsedGroups.has(groupName)) {
      this.collapsedGroups.delete(groupName);
    } else {
      this.collapsedGroups.add(groupName);
    }
    this.saveSettings();
    this.onDidChangeTreeDataEmitter.fire();
  }

  /**
   * Set filter by event types
   */
  setEventTypeFilter(types: EventType[] | undefined): void {
    this.filterEventTypes = types;
    this.currentPage = 0;
    void this.refresh();
  }

  /**
   * Set filter by issue ID
   */
  setIssueFilter(issueId: string | undefined): void {
    this.filterIssueId = issueId;
    this.currentPage = 0;
    void this.refresh();
  }

  /**
   * Set time range filter
   */
  setTimeRangeFilter(range: 'today' | 'week' | 'month' | 'all'): void {
    this.filterTimeRange = range;
    this.currentPage = 0;
    void this.refresh();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filterEventTypes = undefined;
    this.filterIssueId = undefined;
    this.filterTimeRange = 'all';
    this.currentPage = 0;
    void this.refresh();
  }

  /**
   * Load next page of events
   */
  async loadMoreEvents(): Promise<void> {
    if ((this.currentPage + 1) * this.pageSize < this.totalEvents) {
      this.currentPage++;
      await this.refresh();
    }
  }

  /**
   * Get statistics about current events
   */
  getStats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const event of this.events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
    }
    return { total: this.totalEvents, byType };
  }

  /**
   * Dispose resources
   */
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
}
