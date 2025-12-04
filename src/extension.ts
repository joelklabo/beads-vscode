import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import {
  BeadItemData,
  normalizeBead,
  extractBeads,
  resolveDataFilePath,
  formatError,
  escapeHtml,
  linkifyText,
  formatRelativeTime,
  isStale,
  getStaleInfo
} from './utils';
import { ActivityFeedTreeDataProvider } from './activityFeedProvider';
import { EventType } from './activityFeed';
import { currentWorktreeId } from './worktree';

const execFileAsync = promisify(execFile);

async function findBdCommand(configPath: string): Promise<string> {
  // If user specified a path other than default, try to use it
  if (configPath && configPath !== 'bd') {
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      throw new Error(`Configured bd path not found: ${configPath}`);
    }
  }

  // Try 'bd' in PATH first
  try {
    await execFileAsync('bd', ['--version']);
    return 'bd';
  } catch {
    // Fall through to try common locations
  }

  // Try common installation locations
  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }

  throw new Error('bd command not found. Please install beads CLI: https://github.com/steveyegge/beads');
}

let guardWarningShown = false;

async function runWorktreeGuard(projectRoot: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('beads');
  const guardEnabled = config.get<boolean>('enableWorktreeGuard', true);
  if (!guardEnabled) {
    if (!guardWarningShown) {
      guardWarningShown = true;
      void vscode.window.showWarningMessage('Worktree guard disabled; operations may be unsafe.');
    }
    return;
  }

  const guardPath = path.join(projectRoot, 'scripts', 'worktree-guard.sh');
  try {
    await fs.access(guardPath);
  } catch {
    return;
  }

  await execFileAsync(guardPath, { cwd: projectRoot });
}

async function runBdCommand(args: string[], projectRoot: string, requireGuard = true): Promise<void> {
  if (requireGuard) {
    await runWorktreeGuard(projectRoot);
  }

  const commandPath = await findBdCommand(vscode.workspace.getConfiguration('beads').get<string>('commandPath', 'bd'));
  await execFileAsync(commandPath, args, { cwd: projectRoot });
}

interface BeadsDocument {
  filePath: string;
  root: unknown;
  beads: any[];
}

// Status section item for grouping beads by status
class StatusSectionItem extends vscode.TreeItem {
  public readonly status: string;
  public readonly beads: BeadItemData[];
  
  constructor(status: string, beads: BeadItemData[], isCollapsed: boolean = false) {
    const statusDisplay = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    super(statusDisplay, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    
    this.status = status;
    this.beads = beads;
    this.contextValue = 'statusSection';
    
    // Show count as description
    this.description = `${beads.length}`;
    
    // Status-specific icon and color
    const iconConfig: Record<string, { icon: string; color: string }> = {
      'open': { icon: 'circle-outline', color: 'charts.blue' },
      'in_progress': { icon: 'clock', color: 'charts.yellow' },
      'blocked': { icon: 'error', color: 'errorForeground' },
      'closed': { icon: 'pass', color: 'testing.iconPassed' }
    };
    
    const config = iconConfig[status] || { icon: 'folder', color: 'foreground' };
    this.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
    
    // Tooltip
    this.tooltip = `${statusDisplay}: ${beads.length} issue${beads.length !== 1 ? 's' : ''}`;
  }
}

// Warning section item for stale in_progress tasks
class WarningSectionItem extends vscode.TreeItem {
  public readonly beads: BeadItemData[];
  public readonly thresholdMinutes: number;
  
  constructor(beads: BeadItemData[], thresholdMinutes: number, isCollapsed: boolean = false) {
    super('⚠️ Stale Tasks', isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    
    this.beads = beads;
    this.thresholdMinutes = thresholdMinutes;
    this.contextValue = 'warningSection';
    
    // Show count as description
    this.description = `${beads.length}`;
    
    // Warning icon with orange color
    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
    
    // Tooltip explaining what stale tasks are
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**Stale Tasks:** ${beads.length} issue${beads.length !== 1 ? 's' : ''}\n\n`);
    this.tooltip.appendMarkdown(`These tasks have been in progress for more than ${thresholdMinutes} minutes and may need attention.`);
  }
}

// Epic tree item for grouping tasks under their parent epic (folder-style)
class EpicTreeItem extends vscode.TreeItem {
  public readonly epic: BeadItemData | null;
  public readonly children: BeadItemData[];
  
  private setEpicIcon(status: string | undefined, isCollapsed: boolean): void {
    const statusColors: Record<string, string> = {
      'open': 'charts.blue',
      'in_progress': 'charts.yellow',
      'blocked': 'errorForeground',
      'closed': 'testing.iconPassed',
    };
    const iconColor = statusColors[status || 'open'] || 'charts.blue';
    const iconName = isCollapsed ? 'folder-library' : 'folder-opened';
    this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
  }
  
  updateIcon(isCollapsed: boolean): void {
    if (this.epic) {
      this.setEpicIcon(this.epic.status, isCollapsed);
    }
  }
  
  constructor(epic: BeadItemData | null, children: BeadItemData[], isCollapsed: boolean = false) {
    // Label is just the epic title (like a folder name), or 'Ungrouped' for orphans
    const label = epic ? epic.title : 'Ungrouped';
    super(label, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    
    this.epic = epic;
    this.children = children;
    this.contextValue = epic ? 'epicItem' : 'ungroupedSection';
    
    if (epic) {
      // ID shown in description like other items (folder-style: "id · X items")
      this.description = `${epic.id} · ${children.length} item${children.length !== 1 ? 's' : ''}`;
      
      // Use folder-style icons with status tint, changing based on collapse state
      this.setEpicIcon(epic.status, isCollapsed);
      
      // Make it clickable to open epic detail view (like double-clicking a folder)
      this.command = {
        command: 'beads.openBead',
        title: 'Open Epic',
        arguments: [epic],
      };
      
      // Rich tooltip with epic details
      const tooltip = new vscode.MarkdownString();
      tooltip.isTrusted = true;
      const statusDisplay = (epic.status || 'open').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      tooltip.appendMarkdown(`### 🚀 ${epic.id}\n\n`);
      tooltip.appendMarkdown(`**${epic.title}**\n\n`);
      tooltip.appendMarkdown(`Status: ${statusDisplay}\n\n`);
      tooltip.appendMarkdown(`Children: ${children.length} item${children.length !== 1 ? 's' : ''}\n\n`);
      tooltip.appendMarkdown(`*Click to open epic details*`);
      this.tooltip = tooltip;
    } else {
      // Ungrouped section styling (items without a parent epic)
      this.description = `${children.length} item${children.length !== 1 ? 's' : ''}`;
      this.iconPath = new vscode.ThemeIcon('inbox', new vscode.ThemeColor('charts.blue'));
      this.tooltip = `Items without a parent epic: ${children.length}`;
    }
  }
}

// Ungrouped section item for beads without a parent epic
class UngroupedSectionItem extends vscode.TreeItem {
  public readonly children: BeadItemData[];

  constructor(children: BeadItemData[], isCollapsed: boolean = false) {
    super('Ungrouped', isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);

    this.children = children;
    this.contextValue = 'ungroupedSection';
    this.description = `${children.length} item${children.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('inbox', new vscode.ThemeColor('charts.blue'));
    this.tooltip = `Items without a parent epic: ${children.length}`;
  }
}

// Union type for tree items
type TreeItemType = StatusSectionItem | WarningSectionItem | EpicTreeItem | UngroupedSectionItem | BeadTreeItem;

class BeadsTreeDataProvider implements vscode.TreeDataProvider<TreeItemType>, vscode.TreeDragAndDropController<TreeItemType> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeItemType | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  // Drag and drop support
  readonly dropMimeTypes = ['application/vnd.code.tree.beadsExplorer'];
  readonly dragMimeTypes = ['application/vnd.code.tree.beadsExplorer'];

  private items: BeadItemData[] = [];
  private document: BeadsDocument | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watcherSubscriptions: vscode.Disposable[] = [];
  private watchedFilePath: string | undefined;
  private openPanels: Map<string, vscode.WebviewPanel> = new Map();
  private searchQuery: string = '';
  private refreshInProgress: boolean = false;
  private pendingRefresh: boolean = false;
  private debounceTimer: NodeJS.Timeout | undefined;
  private staleRefreshTimer: NodeJS.Timeout | undefined;
  private treeView: vscode.TreeView<TreeItemType> | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;

  // Manual sort order: Map<issueId, sortIndex>
  private manualSortOrder: Map<string, number> = new Map();

  // Sort mode: 'id' (natural ID sort), 'status' (group by status), or 'epic' (group by parent epic)
  private sortMode: 'id' | 'status' | 'epic' = 'id';
  
  // Collapsed state for status sections
  private collapsedSections: Set<string> = new Set();
  // Collapsed state for epics (id -> collapsed)
  private collapsedEpics: Map<string, boolean> = new Map();

  constructor(private readonly context: vscode.ExtensionContext) {
    // Load persisted sort order
    this.loadSortOrder();
    // Load persisted sort mode
    this.loadSortMode();
    // Load persisted collapsed sections
    this.loadCollapsedSections();
    // Start periodic refresh for stale detection
    this.startStaleRefreshTimer();
  }
  
  private startStaleRefreshTimer(): void {
    // Refresh every 30 seconds to update stale indicators
    // This allows the UI to reflect stale status changes without manual refresh
    const STALE_REFRESH_INTERVAL_MS = 30 * 1000;
    
    this.staleRefreshTimer = setInterval(() => {
      // Only fire if we have items and are in status mode (where stale section is visible)
      if (this.items.length > 0 && this.sortMode === 'status') {
        this.onDidChangeTreeDataEmitter.fire();
      }
    }, STALE_REFRESH_INTERVAL_MS);
  }
  
  dispose(): void {
    if (this.staleRefreshTimer) {
      clearInterval(this.staleRefreshTimer);
      this.staleRefreshTimer = undefined;
    }
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = undefined;
    }
    this.disposeWatcher();
  }

  setTreeView(treeView: vscode.TreeView<TreeItemType>): void {
    this.treeView = treeView;
  }

  setStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    this.statusBarItem = statusBarItem;
  }

  private updateBadge(): void {
    if (!this.treeView) {
      return;
    }

    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beads');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;

    // Count stale in_progress items
    const staleCount = this.items.filter(item => isStale(item, thresholdHours)).length;

    if (staleCount > 0) {
      this.treeView.badge = {
        tooltip: `${staleCount} stale task${staleCount !== 1 ? 's' : ''} (in progress > ${thresholdMinutes} min)`,
        value: staleCount
      };
    } else {
      this.treeView.badge = undefined;
    }

    // Also update status bar
    this.updateStatusBar(staleCount, thresholdMinutes);
  }

  private updateStatusBar(staleCount: number, thresholdMinutes: number): void {
    if (!this.statusBarItem) {
      return;
    }

    if (staleCount > 0) {
      this.statusBarItem.text = `$(warning) ${staleCount} stale task${staleCount !== 1 ? 's' : ''}`;
      this.statusBarItem.tooltip = `${staleCount} task${staleCount !== 1 ? 's' : ''} in progress for more than ${thresholdMinutes} minutes. Click to view.`;
      this.statusBarItem.command = 'beadsExplorer.focus';
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
    // Return children based on element type
    if (element instanceof StatusSectionItem) {
      return element.beads.map((item) => this.createTreeItem(item));
    }
    
    if (element instanceof WarningSectionItem) {
      return element.beads.map((item) => this.createTreeItem(item));
    }
    
    if (element instanceof EpicTreeItem) {
      return element.children.map((item) => this.createTreeItem(item));
    }

    if (element instanceof UngroupedSectionItem) {
      return element.children.map((item) => this.createTreeItem(item));
    }
    
    if (element instanceof BeadTreeItem) {
      return [];
    }

    // Root level
    if (this.items.length === 0) {
      await this.refresh();
    }

    const filteredItems = this.filterItems(this.items);
    
    if (this.sortMode === 'status') {
      return this.createStatusSections(filteredItems);
    }
    
    if (this.sortMode === 'epic') {
      return this.createEpicTree(filteredItems);
    }
    
    const sortedItems = this.applySortOrder(filteredItems);
    return sortedItems.map((item) => this.createTreeItem(item));
  }
  
  private createStatusSections(items: BeadItemData[]): (StatusSectionItem | WarningSectionItem)[] {
    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beads');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    
    // Find stale items
    const staleItems = items.filter(item => isStale(item, thresholdHours));
    
    // Group items by status
    const statusOrder = ['open', 'in_progress', 'blocked', 'closed'];
    const grouped: Record<string, BeadItemData[]> = {};
    
    // Initialize all status groups
    statusOrder.forEach(status => {
      grouped[status] = [];
    });
    
    // Sort items into groups
    items.forEach(item => {
      const status = item.status || 'open';
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(item);
    });
    
    // Sort items within each group by natural ID
    Object.values(grouped).forEach(group => {
      group.sort(naturalSort);
    });
    
    // Create section items
    const sections: (StatusSectionItem | WarningSectionItem)[] = [];
    
    // Add warning section at the top if there are stale items
    if (staleItems.length > 0) {
      const isCollapsed = this.collapsedSections.has('stale');
      sections.push(new WarningSectionItem(staleItems, thresholdMinutes, isCollapsed));
    }
    
    // Add status sections for non-empty groups
    statusOrder.forEach(status => {
      if (grouped[status].length > 0) {
        const isCollapsed = this.collapsedSections.has(status);
        sections.push(new StatusSectionItem(status, grouped[status], isCollapsed));
      }
    });
    
    return sections;
  }
  
  private createEpicTree(items: BeadItemData[]): (EpicTreeItem | UngroupedSectionItem | WarningSectionItem)[] {
    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beads');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    
    // Find stale items so we can surface them above the tree
    const staleItems = items.filter(item => isStale(item, thresholdHours));
    
    // Build maps for epics and their children
    const epicMap = new Map<string, BeadItemData>();
    const childrenMap = new Map<string, BeadItemData[]>();
    const ungrouped: BeadItemData[] = [];
    
    // Register epics
    items.forEach(item => {
      if (item.issueType === 'epic') {
        epicMap.set(item.id, item);
        childrenMap.set(item.id, []);
      }
    });
    
    // Attach children or mark ungrouped
    items.forEach(item => {
      if (item.issueType === 'epic') {
        return;
      }

      const parentId = item.parentId;
      if (parentId && childrenMap.has(parentId)) {
        childrenMap.get(parentId)!.push(item);
      } else {
        ungrouped.push(item);
      }
    });
    
    // Sort children and ungrouped lists
    childrenMap.forEach(children => children.sort(naturalSort));
    ungrouped.sort(naturalSort);
    
    const sections: (EpicTreeItem | UngroupedSectionItem | WarningSectionItem)[] = [];

    // Stale tasks section (collapsible)
    if (staleItems.length > 0) {
      const isCollapsed = this.collapsedSections.has('stale');
      sections.push(new WarningSectionItem(staleItems, thresholdMinutes, isCollapsed));
    }

    // Epic folders
    const sortedEpics = Array.from(epicMap.values()).sort(naturalSort);
    sortedEpics.forEach(epic => {
      const children = childrenMap.get(epic.id) || [];
      const isCollapsed = this.collapsedEpics.get(epic.id) === true;
      sections.push(new EpicTreeItem(epic, children, isCollapsed));
    });

    // Ungrouped bucket at the end
    if (ungrouped.length > 0) {
      const isCollapsed = this.collapsedSections.has('ungrouped');
      sections.push(new UngroupedSectionItem(ungrouped, isCollapsed));
    }
    
    return sections;
  }

  async refresh(): Promise<void> {
    console.log('[Provider DEBUG] refresh() called');
    // If a refresh is already in progress, mark that we need another one
    if (this.refreshInProgress) {
      console.log('[Provider DEBUG] Refresh already in progress, queuing');
      this.pendingRefresh = true;
      return;
    }

    this.refreshInProgress = true;
    try {
      const result = await loadBeads();
      this.items = result.items;
      this.document = result.document;
      console.log('[Provider DEBUG] After loadBeads, items count:', this.items.length);
      console.log('[Provider DEBUG] Items IDs:', this.items.map(i => i.id).slice(0, 10));
      this.ensureWatcher(result.document.filePath);

      // Update badge with stale count
      this.updateBadge();

      this.onDidChangeTreeDataEmitter.fire();

      // Refresh all open webview panels
      this.refreshOpenPanels();
    } catch (error) {
      console.error('Failed to refresh beads', error);
      console.error('[Provider DEBUG] Refresh error:', error);
      void vscode.window.showErrorMessage(formatError('Unable to refresh beads list', error));
    } finally {
      this.refreshInProgress = false;

      // If another refresh was requested while we were running, do it now
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh();
      }
    }
  }

  registerPanel(beadId: string, panel: vscode.WebviewPanel): void {
    this.openPanels.set(beadId, panel);

    panel.onDidDispose(() => {
      this.openPanels.delete(beadId);
    });
  }

  private refreshOpenPanels(): void {
    this.openPanels.forEach((panel, beadId) => {
      const updatedItem = this.items.find((i: BeadItemData) => i.id === beadId);
      if (updatedItem) {
        panel.webview.html = getBeadDetailHtml(updatedItem, this.items);
      }
    });
  }

  private filterItems(items: BeadItemData[]): BeadItemData[] {
    if (!this.searchQuery) {
      return items;
    }

    const query = this.searchQuery.toLowerCase();
    return items.filter((item) => {
      const raw = item.raw as any;
      const searchableFields = [
        item.id,
        item.title,
        raw?.description || '',
        raw?.design || '',
        raw?.acceptance_criteria || '',
        raw?.notes || '',
        raw?.assignee || '',
        item.status || '',
        raw?.issue_type || '',
        ...(raw?.labels || []),
        ...(item.tags || []),
      ];

      return searchableFields.some(field =>
        String(field).toLowerCase().includes(query)
      );
    });
  }

  async search(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search beads by ID, title, description, labels, status, etc.',
      placeHolder: 'Enter search query',
      value: this.searchQuery,
    });

    if (query === undefined) {
      return;
    }

    this.searchQuery = query.trim();
    this.onDidChangeTreeDataEmitter.fire();

    if (this.searchQuery) {
      const count = this.filterItems(this.items).length;
      void vscode.window.showInformationMessage(`Found ${count} bead(s) matching "${this.searchQuery}"`);
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onDidChangeTreeDataEmitter.fire();
    void vscode.window.showInformationMessage('Search cleared');
  }

  async updateExternalReference(item: BeadItemData, newValue: string | undefined): Promise<void> {
    if (!this.document) {
      void vscode.window.showErrorMessage('Beads data is not loaded yet. Try refreshing the explorer.');
      return;
    }

    if (!item.raw || typeof item.raw !== 'object') {
      void vscode.window.showErrorMessage('Unable to update this bead entry because its data is not editable.');
      return;
    }

    const targetKey = item.externalReferenceKey ?? 'external_reference_id';
    const mutable = item.raw as Record<string, unknown>;

    if (newValue && newValue.trim().length > 0) {
      mutable[targetKey] = newValue;
    } else {
      delete mutable[targetKey];
    }

    try {
      await saveBeadsDocument(this.document);
      await this.refresh();
    } catch (error) {
      console.error('Failed to persist beads document', error);
      void vscode.window.showErrorMessage(formatError('Failed to save beads data file', error));
    }
  }

  async updateStatus(item: BeadItemData, newStatus: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      await runBdCommand(['update', item.id, '--status', newStatus], projectRoot, true);
      await this.refresh();
      void vscode.window.showInformationMessage(`Updated status to: ${newStatus}`);
    } catch (error) {
      console.error('Failed to update status', error);
      void vscode.window.showErrorMessage(formatError('Failed to update status', error));
    }
  }

  async updateTitle(item: BeadItemData, newTitle: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      await runBdCommand(['update', item.id, '--title', newTitle], projectRoot, true);
      await this.refresh();
      void vscode.window.showInformationMessage(`Updated title to: ${newTitle}`);
    } catch (error) {
      console.error('Failed to update title', error);
      void vscode.window.showErrorMessage(formatError('Failed to update title', error));
    }
  }

  async addLabel(item: BeadItemData, label: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      await runBdCommand(['label', 'add', item.id, label], projectRoot, true);
      await this.refresh();
      void vscode.window.showInformationMessage(`Added label: ${label}`);
    } catch (error) {
      console.error('Failed to add label', error);
      void vscode.window.showErrorMessage(formatError('Failed to add label', error));
    }
  }

  async removeLabel(item: BeadItemData, label: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      await runBdCommand(['label', 'remove', item.id, label], projectRoot, true);
      await this.refresh();
      void vscode.window.showInformationMessage(`Removed label: ${label}`);
    } catch (error) {
      console.error('Failed to remove label', error);
      void vscode.window.showErrorMessage(formatError('Failed to remove label', error));
    }
  }

  private createTreeItem(item: BeadItemData): BeadTreeItem {
    const treeItem = new BeadTreeItem(item);
    treeItem.contextValue = 'bead';

    treeItem.command = {
      command: 'beads.openBead',
      title: 'Open Bead',
      arguments: [item],
    };

    return treeItem;
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // Use a longer debounce (1 second) to avoid rapid refreshes from SQLite WAL activity
    this.debounceTimer = setTimeout(() => {
      void this.refresh();
    }, 1000);
  }

  private ensureWatcher(filePath: string): void {
    if (this.watchedFilePath === filePath && this.fileWatcher) {
      return;
    }

    this.disposeWatcher();

    try {
      // Only watch the main .db file, not WAL/SHM files
      // WAL files change constantly during normal SQLite operations and would cause excessive refreshes
      // The main .db file only changes when WAL checkpoints occur or on direct writes
      const pattern = new vscode.RelativePattern(filePath, '*.db');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = watcher.onDidChange(() => this.debouncedRefresh());
      const onCreate = watcher.onDidCreate(() => this.debouncedRefresh());
      const onDelete = watcher.onDidDelete(async () => {
        this.items = [];
        this.document = undefined;
        this.onDidChangeTreeDataEmitter.fire();
      });

      this.context.subscriptions.push(watcher, onChange, onCreate, onDelete);
      this.fileWatcher = watcher;
      this.watcherSubscriptions = [onChange, onCreate, onDelete];
      this.watchedFilePath = filePath;
    } catch (error) {
      console.warn('Failed to start watcher for beads database', error);
    }
  }

  private disposeWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    for (const subscription of this.watcherSubscriptions) {
      subscription.dispose();
    }
    this.watcherSubscriptions = [];
    this.watchedFilePath = undefined;
  }

  // Drag and drop implementation
  async handleDrag(source: readonly TreeItemType[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    // Only allow dragging BeadTreeItems, not StatusSectionItems
    const beadItems = source.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
    if (beadItems.length === 0) {
      return;
    }
    const items = beadItems.map(item => item.bead);
    dataTransfer.set('application/vnd.code.tree.beadsExplorer', new vscode.DataTransferItem(items));
  }

  async handleDrop(target: TreeItemType | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    const transferItem = dataTransfer.get('application/vnd.code.tree.beadsExplorer');
    if (!transferItem) {
      return;
    }

    const draggedItems: BeadItemData[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }
    
    // Can't drop on status sections
    if (target instanceof StatusSectionItem) {
      return;
    }

    // Get the current filtered and sorted items
    const currentItems = this.applySortOrder(this.filterItems(this.items));

    // Find the drop position
    let dropIndex: number;
    if (target && target instanceof BeadTreeItem) {
      // Drop before the target item
      dropIndex = currentItems.findIndex(item => item.id === target.bead.id);
      if (dropIndex === -1) {
        return;
      }
    } else {
      // Drop at the end
      dropIndex = currentItems.length;
    }

    // Remove dragged items from their current positions
    const itemsToMove = new Set(draggedItems.map(item => item.id));
    const remainingItems = currentItems.filter(item => !itemsToMove.has(item.id));

    // Insert dragged items at the drop position
    const newOrder = [
      ...remainingItems.slice(0, dropIndex),
      ...draggedItems,
      ...remainingItems.slice(dropIndex)
    ];

    // Update manual sort order
    newOrder.forEach((item, index) => {
      this.manualSortOrder.set(item.id, index);
    });

    // Save and refresh
    this.saveSortOrder();
    this.onDidChangeTreeDataEmitter.fire();
  }

  private loadSortOrder(): void {
    const saved = this.context.workspaceState.get<Record<string, number>>('beads.manualSortOrder');
    if (saved) {
      this.manualSortOrder = new Map(Object.entries(saved));
    }
  }

  private saveSortOrder(): void {
    const obj: Record<string, number> = {};
    this.manualSortOrder.forEach((index, id) => {
      obj[id] = index;
    });
    void this.context.workspaceState.update('beads.manualSortOrder', obj);
  }

  clearSortOrder(): void {
    this.manualSortOrder.clear();
    void this.context.workspaceState.update('beads.manualSortOrder', undefined);
    this.onDidChangeTreeDataEmitter.fire();
    void vscode.window.showInformationMessage('Manual sort order cleared');
  }

  private loadSortMode(): void {
    const saved = this.context.workspaceState.get<'id' | 'status' | 'epic'>('beads.sortMode');
    if (saved) {
      this.sortMode = saved;
    }
  }

  private saveSortMode(): void {
    void this.context.workspaceState.update('beads.sortMode', this.sortMode);
  }
  
  private loadCollapsedSections(): void {
    const savedSections = this.context.workspaceState.get<string[]>('beads.collapsedSections');
    if (savedSections) {
      this.collapsedSections = new Set(savedSections.filter(key => !key.startsWith('epic-')));
      // Migration: legacy epic keys stored in collapsedSections (epic-<id>)
      savedSections.forEach(key => {
        if (key.startsWith('epic-')) {
          const epicId = key.replace('epic-', '');
          this.collapsedEpics.set(epicId, true);
        }
      });
    }

    const savedEpics = this.context.workspaceState.get<Record<string, boolean>>('beads.collapsedEpics');
    if (savedEpics) {
      this.collapsedEpics = new Map(Object.entries(savedEpics));
    }
  }
  
  private saveCollapsedSections(): void {
    // Persist non-epic sections
    const sectionStates = Array.from(this.collapsedSections).filter(key => !key.startsWith('epic-'));
    void this.context.workspaceState.update('beads.collapsedSections', sectionStates);

    // Persist epic collapse states separately
    const epicState: Record<string, boolean> = {};
    this.collapsedEpics.forEach((collapsed, epicId) => {
      if (collapsed) {
        epicState[epicId] = true;
      }
    });
    void this.context.workspaceState.update('beads.collapsedEpics', epicState);
  }
  
  toggleSectionCollapse(status: string): void {
    if (this.collapsedSections.has(status)) {
      this.collapsedSections.delete(status);
    } else {
      this.collapsedSections.add(status);
    }
    this.saveCollapsedSections();
    this.onDidChangeTreeDataEmitter.fire();
  }

  private getCollapseKey(element: TreeItemType): string | undefined {
    if (element instanceof StatusSectionItem) {
      return element.status;
    }
    if (element instanceof WarningSectionItem) {
      return 'stale';
    }
    if (element instanceof EpicTreeItem) {
      return element.epic ? `epic-${element.epic.id}` : undefined;
    }
    if (element instanceof UngroupedSectionItem) {
      return 'ungrouped';
    }
    return undefined;
  }

  handleCollapseChange(element: TreeItemType, isCollapsed: boolean): void {
    if (element instanceof EpicTreeItem && element.epic) {
      this.collapsedEpics.set(element.epic.id, isCollapsed);
      this.saveCollapsedSections();
      element.updateIcon(isCollapsed);
      element.collapsibleState = isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
      this.onDidChangeTreeDataEmitter.fire(element);
      return;
    }

    const key = this.getCollapseKey(element);
    if (!key) {
      return;
    }

    if (isCollapsed) {
      this.collapsedSections.add(key);
    } else {
      this.collapsedSections.delete(key);
    }
    this.saveCollapsedSections();

    this.onDidChangeTreeDataEmitter.fire(element);
  }

  toggleSortMode(): void {
    // Cycle through: id -> status -> epic -> id
    if (this.sortMode === 'id') {
      this.sortMode = 'status';
    } else if (this.sortMode === 'status') {
      this.sortMode = 'epic';
    } else {
      this.sortMode = 'id';
    }
    this.saveSortMode();
    this.onDidChangeTreeDataEmitter.fire();
    const modeDisplay = this.sortMode === 'id' ? 'ID (natural)' : 
                        this.sortMode === 'status' ? 'Status' : 'Epic';
    void vscode.window.showInformationMessage(`Sort mode: ${modeDisplay}`);
  }

  getSortMode(): 'id' | 'status' | 'epic' {
    return this.sortMode;
  }

  private applySortOrder(items: BeadItemData[]): BeadItemData[] {
    // If manual sort order exists, apply it first
    if (this.manualSortOrder.size > 0) {
      // Separate items with manual order from those without
      const itemsWithOrder: Array<{item: BeadItemData, order: number}> = [];
      const itemsWithoutOrder: BeadItemData[] = [];

      items.forEach(item => {
        const order = this.manualSortOrder.get(item.id);
        if (order !== undefined) {
          itemsWithOrder.push({ item, order });
        } else {
          itemsWithoutOrder.push(item);
        }
      });

      // Sort items with manual order by their order index
      itemsWithOrder.sort((a, b) => a.order - b.order);

      // Combine: manually ordered items first, then naturally sorted items
      return [
        ...itemsWithOrder.map(x => x.item),
        ...itemsWithoutOrder
      ];
    }

    // Apply sort mode
    if (this.sortMode === 'status') {
      return this.sortByStatus(items);
    }

    // Default: return items as-is (already naturally sorted by ID)
    return items;
  }

  private sortByStatus(items: BeadItemData[]): BeadItemData[] {
    // Define status priority order: open first, then in_progress, blocked, closed last
    const statusPriority: Record<string, number> = {
      'open': 0,
      'in_progress': 1,
      'blocked': 2,
      'closed': 3
    };

    return [...items].sort((a, b) => {
      const statusA = a.status || 'open';
      const statusB = b.status || 'open';

      const priorityA = statusPriority[statusA] ?? 4;
      const priorityB = statusPriority[statusB] ?? 4;

      // First sort by status priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Then sort by ID naturally within each status group
      return naturalSort(a, b);
    });
  }
}

class BeadTreeItem extends vscode.TreeItem {
  constructor(public readonly bead: BeadItemData, private readonly worktreeId?: string) {
    // Show ID before title
    const label = `${bead.id} ${bead.title}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    // Get stale threshold from config
    const config = vscode.workspace.getConfiguration('beads');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    const staleInfo = getStaleInfo(bead);
    const isTaskStale = isStale(bead, thresholdHours);

    // Build rich description with multiple pieces of info
    const descParts: string[] = [];
    
    // Add stale indicator at the beginning for visibility
    if (isTaskStale && staleInfo) {
      descParts.push(`⚠️ ${staleInfo.formattedTime}`);
    }
    
    // Add description preview (first 40 chars)
    if (bead.description) {
      const preview = bead.description.substring(0, 40).replace(/\n/g, ' ').trim();
      descParts.push(preview + (bead.description.length > 40 ? '…' : ''));
    }
    
    // Add relative timestamp
    if (bead.updatedAt) {
      const relTime = formatRelativeTime(bead.updatedAt);
      if (relTime) {
        descParts.push(relTime);
      }
    }
    
    // Add blocking dependency indicator
    if (bead.blockingDepsCount && bead.blockingDepsCount > 0) {
      descParts.push(`⏳ ${bead.blockingDepsCount} blocker${bead.blockingDepsCount > 1 ? 's' : ''}`);
    }
    
    // Add tags if present (moved to the end)
    if (bead.tags && bead.tags.length > 0) {
      descParts.push(`[${bead.tags.join(', ')}]`);
    }
    
    // Add external reference if present
    if (bead.externalReferenceId) {
      if (bead.externalReferenceDescription) {
        descParts.push(`↗ ${bead.externalReferenceDescription}`);
      } else {
        descParts.push(`↗ ${bead.externalReferenceId}`);
      }
    }
    
    if (descParts.length > 0) {
      this.description = descParts.join(' · ');
    }

    // Build rich tooltip with all details
    this.tooltip = this.buildRichTooltip(bead, isTaskStale, staleInfo);

    // Icon mapping for issue types - creative, memorable icons
    const typeIcons: Record<string, string> = {
      'epic': 'rocket',        // Big initiative/goal
      'task': 'tasklist',      // Work item checklist
      'bug': 'bug',            // Problem (keep existing)
      'feature': 'sparkle',    // New/shiny capability
      'chore': 'wrench',       // Tool/maintenance
      'spike': 'telescope',    // Research/exploration
    };

    // Determine icon color based on status
    const statusColors: Record<string, string> = {
      'open': 'charts.blue',
      'in_progress': isTaskStale ? 'charts.orange' : 'charts.yellow',
      'blocked': 'errorForeground',
      'closed': 'testing.iconPassed',
    };

    // Closed items always show checkmark regardless of type
    if (bead.status === 'closed') {
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else {
      // Use issue type icon with status color
      const iconName = typeIcons[bead.issueType || ''] || 'symbol-event';
      const iconColor = statusColors[bead.status || 'open'] || 'charts.blue';
      this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
    }
  }
  
  private buildRichTooltip(bead: BeadItemData, isTaskStale: boolean, staleInfo: { hoursInProgress: number; formattedTime: string } | undefined): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;
    
    // Title and ID
    md.appendMarkdown(`### ${bead.id}\n\n`);
    md.appendMarkdown(`**${bead.title}**\n\n`);
    
    // Status with colored indicator
    const statusEmoji: Record<string, string> = {
      'open': '🔵',
      'in_progress': '🟡',
      'blocked': '🔴',
      'closed': '🟢'
    };
    const statusDisplay = (bead.status || 'open').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    md.appendMarkdown(`${statusEmoji[bead.status || 'open'] || '⚪'} **Status:** ${statusDisplay}\n\n`);
    
    // Stale warning for in_progress tasks
    if (isTaskStale && staleInfo) {
      md.appendMarkdown(`⚠️ **Stale:** In progress for ${staleInfo.formattedTime} (may need attention)\n\n`);
    }
    
    // Issue type with emoji
    if (bead.issueType) {
      const typeEmoji: Record<string, string> = {
        'epic': '🚀',
        'task': '📋',
        'bug': '🐛',
        'feature': '✨',
        'spike': '🔭',
        'chore': '🔧',
      };
      const typeDisplay = bead.issueType.charAt(0).toUpperCase() + bead.issueType.slice(1);
      md.appendMarkdown(`${typeEmoji[bead.issueType] || '📄'} **Type:** ${typeDisplay}`);
      
      // Add child count for epics
      if (bead.issueType === 'epic' && bead.childCount !== undefined && bead.childCount > 0) {
        md.appendMarkdown(` (${bead.childCount} child${bead.childCount !== 1 ? 'ren' : ''})`);
      }
      md.appendMarkdown(`\n\n`);
    }
    
    // Description preview
    if (bead.description) {
      const preview = bead.description.substring(0, 200).replace(/\n/g, ' ').trim();
      md.appendMarkdown(`📝 ${preview}${bead.description.length > 200 ? '…' : ''}\n\n`);
    }
    
    // Tags
    if (bead.tags && bead.tags.length > 0) {
      md.appendMarkdown(`🏷️ ${bead.tags.join(', ')}\n\n`);
    }
    
    // Blocking dependencies
    if (bead.blockingDepsCount && bead.blockingDepsCount > 0) {
      md.appendMarkdown(`⏳ **Waiting on ${bead.blockingDepsCount} blocker${bead.blockingDepsCount > 1 ? 's' : ''}**\n\n`);
    }
    
    // Timestamps
    if (bead.updatedAt) {
      const relTime = formatRelativeTime(bead.updatedAt);
      md.appendMarkdown(`🕐 Updated ${relTime}\n\n`);
    }
    
    // External reference
    if (bead.externalReferenceId) {
      const displayText = bead.externalReferenceDescription || bead.externalReferenceId;
      md.appendMarkdown(`↗️ **External:** ${displayText}\n\n`);
    }

    if (this.worktreeId) {
      md.appendMarkdown(`🏷️ Worktree: ${this.worktreeId}\n\n`);
    }
    
    // File path
    if (bead.filePath) {
      md.appendMarkdown(`📁 ${bead.filePath}\n`);
    }
    
    return md;
  }
}

function resolveProjectRoot(config: vscode.WorkspaceConfiguration): string | undefined {
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

function naturalSort(a: BeadItemData, b: BeadItemData): number {
  // Split IDs into parts (text and numbers)
  const aParts = a.id.split(/(\d+)/);
  const bParts = b.id.split(/(\d+)/);

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    // Check if both parts are numeric
    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Compare as numbers
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else {
      // Compare as strings
      if (aPart !== bPart) {
        return aPart.localeCompare(bPart);
      }
    }
  }

  // If all parts are equal, shorter ID comes first
  return aParts.length - bParts.length;
}

async function loadBeads(): Promise<{ items: BeadItemData[]; document: BeadsDocument; }> {
  const config = vscode.workspace.getConfiguration('beads');
  const projectRoot = resolveProjectRoot(config);
  const configPath = config.get<string>('commandPath', 'bd');

  console.log('[loadBeads DEBUG] Starting loadBeads, projectRoot:', projectRoot);

  if (!projectRoot) {
    throw new Error('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
  }

  try {
    // Find the bd command
    const commandPath = await findBdCommand(configPath);
    console.log('[loadBeads DEBUG] Found bd command at:', commandPath);

    // Use bd export to get issues with dependencies (JSONL format)
    const { stdout } = await execFileAsync(commandPath, ['export'], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large issue lists
    });

    console.log('[loadBeads DEBUG] bd export stdout length:', stdout?.length ?? 0);
    console.log('[loadBeads DEBUG] bd export stdout preview:', stdout?.substring(0, 500));

    // Parse JSONL output (one JSON object per line)
    let beads: any[] = [];
    if (stdout && stdout.trim()) {
      const lines = stdout.trim().split('\n');
      console.log('[loadBeads DEBUG] Number of JSONL lines:', lines.length);
      beads = lines.map(line => JSON.parse(line));
      console.log('[loadBeads DEBUG] Parsed beads count:', beads.length);
      if (beads.length > 0) {
        console.log('[loadBeads DEBUG] First bead raw:', JSON.stringify(beads[0], null, 2));
      }
    } else {
      console.log('[loadBeads DEBUG] No stdout from bd export');
    }

    // Create a document structure for compatibility
    // Use the database path for file watching instead of JSONL
    const dbPath = path.join(projectRoot, '.beads');
    const document: BeadsDocument = {
      filePath: dbPath, // Watch the .beads directory for any db changes
      root: beads,
      beads
    };

    const items = beads.map((entry, index) => normalizeBead(entry, index));
    console.log('[loadBeads DEBUG] Normalized items count:', items.length);

    // Sort items using natural sort (handles numeric parts correctly)
    items.sort(naturalSort);

    return { items, document };
  } catch (error: any) {
    // Fallback to reading JSON file if CLI command fails
    console.warn('Failed to load beads via CLI, falling back to file reading:', error.message);
    console.error('[loadBeads DEBUG] Full error:', error);
    return loadBeadsFromFile(projectRoot, config);
  }
}

async function loadBeadsFromFile(projectRoot: string, config: vscode.WorkspaceConfiguration): Promise<{ items: BeadItemData[]; document: BeadsDocument; }> {
  const dataFileConfig = config.get<string>('dataFile', '.beads/issues.jsonl');
  const resolvedDataFile = resolveDataFilePath(dataFileConfig, projectRoot);

  if (!resolvedDataFile) {
    throw new Error('Unable to resolve beads data file. Set "beads.projectRoot" or provide an absolute "beads.dataFile" path.');
  }

  const document = await readBeadsDocument(resolvedDataFile);
  const items = document.beads.map((entry, index) => normalizeBead(entry, index));

  // Sort items using natural sort (handles numeric parts correctly)
  items.sort(naturalSort);

  return { items, document };
}

async function readBeadsDocument(filePath: string): Promise<BeadsDocument> {
  const rawContent = await fs.readFile(filePath, 'utf8');

  // Check if it's JSONL format (each line is a JSON object)
  if (filePath.endsWith('.jsonl')) {
    const lines = rawContent.trim().split('\n').filter(line => line.trim().length > 0);
    const beads = lines.map(line => JSON.parse(line));
    return { filePath, root: beads, beads };
  }

  // Otherwise assume it's JSON format
  const root = JSON.parse(rawContent);
  const beads = extractBeads(root);

  if (!Array.isArray(beads)) {
    throw new Error('Beads data file does not contain a beads array.');
  }

  return { filePath, root, beads };
}

async function saveBeadsDocument(document: BeadsDocument): Promise<void> {
  // Check if it's JSONL format
  if (document.filePath.endsWith('.jsonl')) {
    const lines = document.beads.map(bead => JSON.stringify(bead)).join('\n');
    const content = lines.endsWith('\n') ? lines : `${lines}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  } else {
    const serialized = JSON.stringify(document.root, null, 2);
    const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  }
}

interface DependencyTreeNode {
  id: string;
  title: string;
  status: string;
  isCurrent: boolean;
  children: DependencyTreeNode[];
}

function buildDependencyTree(
  itemId: string,
  allItems: BeadItemData[],
  direction: 'upstream' | 'downstream',
  visited: Set<string> = new Set()
): DependencyTreeNode | null {
  if (visited.has(itemId)) {
    return null; // Prevent cycles
  }
  visited.add(itemId);

  const item = allItems.find(i => i.id === itemId);
  if (!item) {
    return null;
  }

  const raw = item.raw as any;
  const children: DependencyTreeNode[] = [];

  if (direction === 'upstream') {
    // Find issues this one depends on (upstream)
    const dependencies = raw?.dependencies || [];
    for (const dep of dependencies) {
      const targetId = dep.depends_on_id || dep.id || dep.issue_id;
      if (targetId) {
        const childNode = buildDependencyTree(targetId, allItems, direction, new Set(visited));
        if (childNode) {
          children.push(childNode);
        }
      }
    }
  } else {
    // Find issues that depend on this one (downstream)
    for (const otherItem of allItems) {
      const otherRaw = otherItem.raw as any;
      const otherDeps = otherRaw?.dependencies || [];
      for (const dep of otherDeps) {
        const targetId = dep.depends_on_id || dep.id || dep.issue_id;
        if (targetId === itemId) {
          const childNode = buildDependencyTree(otherItem.id, allItems, direction, new Set(visited));
          if (childNode) {
            children.push(childNode);
          }
        }
      }
    }
  }

  return {
    id: item.id,
    title: item.title,
    status: item.status || 'open',
    isCurrent: false,
    children
  };
}

function renderTreeHtml(node: DependencyTreeNode, currentId: string, isLast: boolean = true, prefix: string = ''): string {
  const isCurrent = node.id === currentId;
  const statusColors: Record<string, string> = {
    'open': '#3794ff',
    'in_progress': '#f9c513',
    'blocked': '#f14c4c',
    'closed': '#73c991'
  };
  const statusColor = statusColors[node.status] || '#666';
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  
  let html = `<div class="tree-node ${isCurrent ? 'current-node' : ''}" data-issue-id="${node.id}">`;
  html += `<span class="tree-prefix">${prefix}${connector}</span>`;
  html += `<span class="tree-status-dot" style="background-color: ${statusColor};"></span>`;
  html += `<span class="tree-id">${node.id}</span>`;
  html += `<span class="tree-title">${escapeHtml(node.title)}</span>`;
  html += `</div>`;

  node.children.forEach((child, index) => {
    const isChildLast = index === node.children.length - 1;
    html += renderTreeHtml(child, currentId, isChildLast, childPrefix);
  });

  return html;
}

function getBeadDetailHtml(item: BeadItemData, allItems?: BeadItemData[]): string {
  const raw = item.raw as any;
  const description = raw?.description || '';
  const design = raw?.design || '';
  const acceptanceCriteria = raw?.acceptance_criteria || '';
  const notes = raw?.notes || '';
  const issueType = raw?.issue_type || '';
  const priority = raw?.priority || '';
  const createdAt = raw?.created_at ? new Date(raw.created_at).toLocaleString() : '';
  const updatedAt = raw?.updated_at ? new Date(raw.updated_at).toLocaleString() : '';
  const closedAt = raw?.closed_at ? new Date(raw.closed_at).toLocaleString() : '';
  const dependencies = raw?.dependencies || [];
  const assignee = raw?.assignee || '';
  const labels = raw?.labels || [];

  // Build dependency trees for visualization
  let dependencyTreeHtml = '';
  if (allItems && allItems.length > 0) {
    const upstreamTree = buildDependencyTree(item.id, allItems, 'upstream');
    const downstreamTree = buildDependencyTree(item.id, allItems, 'downstream');
    
    const hasUpstream = upstreamTree && upstreamTree.children.length > 0;
    const hasDownstream = downstreamTree && downstreamTree.children.length > 0;
    
    if (hasUpstream || hasDownstream) {
      dependencyTreeHtml = `
        <div class="dependency-tree-section">
            <div class="dependency-tree-header" id="treeHeader">
                <span class="tree-toggle" id="treeToggle">▼</span>
                <span class="section-title" style="margin: 0;">Dependency Tree</span>
            </div>
            <div class="dependency-tree-container" id="treeContainer">`;
      
      if (hasUpstream) {
        dependencyTreeHtml += `<div class="tree-direction-label">↑ Depends On (upstream)</div>`;
        dependencyTreeHtml += renderTreeHtml(upstreamTree!, item.id, true, '');
      }
      
      if (hasDownstream) {
        dependencyTreeHtml += `<div class="tree-direction-label">↓ Blocked By This (downstream)</div>`;
        dependencyTreeHtml += renderTreeHtml(downstreamTree!, item.id, true, '');
      }
      
      dependencyTreeHtml += `</div></div>`;
    }
  }

  // Separate outgoing dependencies (this issue depends on) from incoming (this issue blocks)
  const dependsOn: any[] = [];
  const blocks: any[] = [];

  // Process outgoing dependencies from this issue
  dependencies.forEach((dep: any) => {
    const targetId = dep.depends_on_id || dep.id || dep.issue_id;
    const depType = dep.dep_type || dep.type || 'related';

    // Find the target issue to get its details
    const targetIssue = allItems?.find((i: BeadItemData) => i.id === targetId);

    dependsOn.push({
      id: targetId,
      title: targetIssue?.title || '',
      status: targetIssue?.status || '',
      type: depType,
      raw: dep
    });
  });

  // Find incoming dependencies (issues that depend on this one)
  if (allItems) {
    allItems.forEach((otherItem: BeadItemData) => {
      const otherRaw = otherItem.raw as any;
      const otherDeps = otherRaw?.dependencies || [];

      otherDeps.forEach((dep: any) => {
        const targetId = dep.depends_on_id || dep.id || dep.issue_id;
        if (targetId === item.id) {
          const depType = dep.dep_type || dep.type || 'related';
          blocks.push({
            id: otherItem.id,
            title: otherItem.title,
            status: otherItem.status || '',
            type: depType,
            raw: dep
          });
        }
      });
    });
  }

  const statusColor = {
    'open': '#3794ff',
    'in_progress': '#f9c513',
    'blocked': '#f14c4c',
    'closed': '#73c991'
  }[item.status || 'open'] || '#666';

  const priorityLabel = ['', 'P1', 'P2', 'P3', 'P4'][priority] || '';

  // Format status for display
  const statusDisplay = item.status
    ? item.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.id}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        .issue-id {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
            margin-bottom: 8px;
        }
        .edit-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        .edit-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px 0;
            border-radius: 4px;
            padding: 4px;
            transition: background-color 0.2s;
        }
        .title[contenteditable="true"] {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            outline: none;
            cursor: text;
        }
        .title[contenteditable="true"]:focus {
            border-color: var(--vscode-focusBorder);
        }
        .metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-top: 12px;
            align-items: center;
        }
        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-badge {
            background-color: ${statusColor}22;
            color: ${statusColor};
            border: 1px solid ${statusColor}44;
            position: relative;
        }
        .status-badge.editable {
            cursor: pointer;
            padding-right: 24px;
        }
        .status-badge.editable:hover {
            opacity: 0.8;
        }
        .status-badge.editable::after {
            content: '▾';
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
        }
        .status-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            min-width: 150px;
        }
        .status-dropdown.show {
            display: block;
        }
        .status-option {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.1s;
        }
        .status-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .status-option:first-child {
            border-radius: 4px 4px 0 0;
        }
        .status-option:last-child {
            border-radius: 0 0 4px 4px;
        }
        .status-wrapper {
            position: relative;
        }
        .type-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .priority-badge {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        .section {
            margin: 24px 0;
        }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .description {
            white-space: pre-wrap;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 12px 16px;
            border-radius: 4px;
        }
        .meta-item {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }
        .meta-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            min-width: 120px;
        }
        .meta-value {
            color: var(--vscode-foreground);
        }
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .tag {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .tag.editable {
            padding-right: 8px;
        }
        .tag-remove {
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            opacity: 0.7;
            line-height: 1;
        }
        .tag-remove:hover {
            opacity: 1;
            color: var(--vscode-errorForeground);
        }
        .dependency-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 8px;
            border-left: 3px solid var(--vscode-textLink-foreground);
            cursor: pointer;
            transition: background-color 0.2s ease, transform 0.1s ease;
        }
        .dependency-item:hover {
            background-color: var(--vscode-list-hoverBackground);
            transform: translateX(2px);
        }
        .dependency-item:active {
            transform: translateX(0px);
        }
        .dependency-type {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 600;
        }
        .empty {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .external-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .external-link:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
        .dependency-tree-section {
            margin: 24px 0;
        }
        .dependency-tree-header {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        .dependency-tree-header:hover {
            opacity: 0.8;
        }
        .tree-toggle {
            font-size: 12px;
            transition: transform 0.2s;
        }
        .tree-toggle.collapsed {
            transform: rotate(-90deg);
        }
        .dependency-tree-container {
            font-family: monospace;
            font-size: 13px;
            line-height: 1.8;
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            margin-top: 12px;
            overflow-x: auto;
        }
        .dependency-tree-container.collapsed {
            display: none;
        }
        .tree-node {
            white-space: nowrap;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
        }
        .tree-node:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .tree-node.current-node {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: 600;
        }
        .tree-prefix {
            color: var(--vscode-descriptionForeground);
        }
        .tree-status-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }
        .tree-id {
            color: var(--vscode-textLink-foreground);
            margin-right: 8px;
        }
        .tree-title {
            color: var(--vscode-foreground);
        }
        .tree-direction-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 600;
            margin: 16px 0 8px 0;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tree-direction-label:first-child {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-top">
            <div class="issue-id">${item.id}</div>
            <button class="edit-button" id="editButton">Edit</button>
        </div>
        <h1 class="title" id="issueTitle" contenteditable="false">${escapeHtml(item.title)}</h1>
        <div class="metadata">
            <div class="status-wrapper">
                <span class="badge status-badge" id="statusBadge" data-status="${item.status || 'open'}">${statusDisplay || 'Open'}</span>
                <div class="status-dropdown" id="statusDropdown">
                    <div class="status-option" data-status="open">Open</div>
                    <div class="status-option" data-status="in_progress">In Progress</div>
                    <div class="status-option" data-status="blocked">Blocked</div>
                    <div class="status-option" data-status="closed">Closed</div>
                </div>
            </div>
            ${issueType ? `<span class="badge type-badge">${issueType.toUpperCase()}</span>` : ''}
            ${priorityLabel ? `<span class="badge priority-badge">${priorityLabel}</span>` : ''}
        </div>
    </div>

    ${description ? `
    <div class="section">
        <div class="section-title">Description</div>
        <div class="description">${linkifyText(description)}</div>
    </div>
    ` : ''}

    ${design ? `
    <div class="section">
        <div class="section-title">Design</div>
        <div class="description">${linkifyText(design)}</div>
    </div>
    ` : ''}

    ${acceptanceCriteria ? `
    <div class="section">
        <div class="section-title">Acceptance Criteria</div>
        <div class="description">${linkifyText(acceptanceCriteria)}</div>
    </div>
    ` : ''}

    ${notes ? `
    <div class="section">
        <div class="section-title">Notes</div>
        <div class="description">${linkifyText(notes)}</div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">Details</div>
        ${assignee ? `<div class="meta-item"><span class="meta-label">Assignee:</span><span class="meta-value">${escapeHtml(assignee)}</span></div>` : ''}
        ${item.externalReferenceId ? `<div class="meta-item"><span class="meta-label">External Ref:</span><span class="meta-value"><a href="${escapeHtml(item.externalReferenceId)}" class="external-link" target="_blank">${escapeHtml(item.externalReferenceDescription || item.externalReferenceId)}</a></span></div>` : ''}
        ${createdAt ? `<div class="meta-item"><span class="meta-label">Created:</span><span class="meta-value">${createdAt}</span></div>` : ''}
        ${updatedAt ? `<div class="meta-item"><span class="meta-label">Updated:</span><span class="meta-value">${updatedAt}</span></div>` : ''}
        ${closedAt ? `<div class="meta-item"><span class="meta-label">Closed:</span><span class="meta-value">${closedAt}</span></div>` : ''}
    </div>

    <div class="section">
        <div class="section-title">Labels</div>
        <div class="tags" id="labelsContainer">
            ${labels && labels.length > 0 ? labels.map((label: string) => `<span class="tag" data-label="${escapeHtml(label)}">${escapeHtml(label)}<span class="tag-remove" style="display: none;">×</span></span>`).join('') : '<span class="empty">No labels</span>'}
        </div>
        <div style="margin-top: 12px; display: none;" id="labelActions">
            <button class="edit-button" id="addInReviewButton" style="margin-right: 8px;">
                <span id="inReviewButtonText">Mark as In Review</span>
            </button>
            <button class="edit-button" id="addLabelButton">Add Label</button>
        </div>
    </div>

    ${dependsOn.length > 0 ? `
    <div class="section">
        <div class="section-title">Depends On</div>
        ${dependsOn.map((dep: any) => `
            <div class="dependency-item" data-issue-id="${dep.id}">
                <div class="dependency-type">${dep.type}</div>
                <strong>${dep.id}</strong>
                ${dep.title ? `<div style="margin-top: 4px;">${escapeHtml(dep.title)}</div>` : ''}
                ${dep.status ? `<span class="badge status-badge" style="margin-top: 4px; display: inline-block;">${dep.status.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>` : ''}
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${blocks.length > 0 ? `
    <div class="section">
        <div class="section-title">Blocks</div>
        ${blocks.map((dep: any) => `
            <div class="dependency-item" data-issue-id="${dep.id}">
                <div class="dependency-type">${dep.type}</div>
                <strong>${dep.id}</strong>
                ${dep.title ? `<div style="margin-top: 4px;">${escapeHtml(dep.title)}</div>` : ''}
                ${dep.status ? `<span class="badge status-badge" style="margin-top: 4px; display: inline-block;">${dep.status.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>` : ''}
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${dependencyTreeHtml}

    <script>
        const vscode = acquireVsCodeApi();
        let isEditMode = false;

        const editButton = document.getElementById('editButton');
        const statusBadge = document.getElementById('statusBadge');
        const statusDropdown = document.getElementById('statusDropdown');
        const issueTitle = document.getElementById('issueTitle');

        const labelActions = document.getElementById('labelActions');
        const addInReviewButton = document.getElementById('addInReviewButton');
        const addLabelButton = document.getElementById('addLabelButton');
        const inReviewButtonText = document.getElementById('inReviewButtonText');
        const labelsContainer = document.getElementById('labelsContainer');

        // Dependency tree toggle
        const treeHeader = document.getElementById('treeHeader');
        const treeToggle = document.getElementById('treeToggle');
        const treeContainer = document.getElementById('treeContainer');
        
        if (treeHeader && treeToggle && treeContainer) {
            treeHeader.addEventListener('click', () => {
                treeToggle.classList.toggle('collapsed');
                treeContainer.classList.toggle('collapsed');
            });
        }

        // Tree node clicks - navigate to that issue
        document.querySelectorAll('.tree-node').forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                const issueId = node.getAttribute('data-issue-id');
                if (issueId && issueId !== '${item.id}') {
                    vscode.postMessage({
                        command: 'openBead',
                        beadId: issueId
                    });
                }
            });
        });

        let originalTitle = issueTitle.textContent;

        console.log('DEBUG: labelActions element:', labelActions);
        console.log('DEBUG: addInReviewButton element:', addInReviewButton);

        const currentLabels = ${JSON.stringify(labels || [])};
        const hasInReview = currentLabels.includes('in-review');

        if (hasInReview) {
            inReviewButtonText.textContent = 'Remove In Review';
        }

        editButton.addEventListener('click', () => {
            isEditMode = !isEditMode;

            if (isEditMode) {
                editButton.textContent = 'Done';
                statusBadge.classList.add('editable');
                labelActions.style.display = 'block';
                issueTitle.contentEditable = 'true';
                originalTitle = issueTitle.textContent;

                // Show remove buttons on labels
                document.querySelectorAll('.tag-remove').forEach(btn => {
                    btn.style.display = 'inline';
                });
                document.querySelectorAll('.tag').forEach(tag => {
                    if (!tag.classList.contains('empty')) {
                        tag.classList.add('editable');
                    }
                });
            } else {
                editButton.textContent = 'Edit';
                statusBadge.classList.remove('editable');
                statusDropdown.classList.remove('show');
                labelActions.style.display = 'none';
                issueTitle.contentEditable = 'false';

                // Save title if changed
                const newTitle = issueTitle.textContent.trim();
                if (newTitle !== originalTitle && newTitle.length > 0) {
                    vscode.postMessage({
                        command: 'updateTitle',
                        title: newTitle,
                        issueId: '${item.id}'
                    });
                    originalTitle = newTitle;
                } else if (newTitle.length === 0) {
                    // Restore original title if empty
                    issueTitle.textContent = originalTitle;
                }

                // Hide remove buttons on labels
                document.querySelectorAll('.tag-remove').forEach(btn => {
                    btn.style.display = 'none';
                });
                document.querySelectorAll('.tag').forEach(tag => {
                    tag.classList.remove('editable');
                });
            }
        });

        statusBadge.addEventListener('click', () => {
            if (isEditMode) {
                statusDropdown.classList.toggle('show');
            }
        });

        document.querySelectorAll('.status-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const newStatus = e.target.getAttribute('data-status');

                // Send message to extension
                vscode.postMessage({
                    command: 'updateStatus',
                    status: newStatus,
                    issueId: '${item.id}'
                });

                // Close dropdown
                statusDropdown.classList.remove('show');
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!statusBadge.contains(e.target) && !statusDropdown.contains(e.target)) {
                statusDropdown.classList.remove('show');
            }
        });

        // Handle "In Review" toggle button
        addInReviewButton.addEventListener('click', () => {
            const hasInReview = currentLabels.includes('in-review');

            if (hasInReview) {
                vscode.postMessage({
                    command: 'removeLabel',
                    label: 'in-review',
                    issueId: '${item.id}'
                });
            } else {
                vscode.postMessage({
                    command: 'addLabel',
                    label: 'in-review',
                    issueId: '${item.id}'
                });
            }
        });

        // Handle custom label addition
        addLabelButton.addEventListener('click', () => {
            const label = prompt('Enter label name:');
            if (label && label.trim()) {
                vscode.postMessage({
                    command: 'addLabel',
                    label: label.trim(),
                    issueId: '${item.id}'
                });
            }
        });

        // Handle label removal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tagElement = e.target.closest('.tag');
                const label = tagElement.getAttribute('data-label');

                if (label) {
                    vscode.postMessage({
                        command: 'removeLabel',
                        label: label,
                        issueId: '${item.id}'
                    });
                }
            }
        });

        // Handle dependency item clicks
        document.addEventListener('click', (e) => {
            const dependencyItem = e.target.closest('.dependency-item');
            if (dependencyItem) {
                const issueId = dependencyItem.getAttribute('data-issue-id');
                if (issueId) {
                    vscode.postMessage({
                        command: 'openBead',
                        beadId: issueId
                    });
                }
            }
        });

        // Handle external link clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('external-link')) {
                e.preventDefault();
                const url = e.target.getAttribute('href');
                if (url) {
                    vscode.postMessage({
                        command: 'openExternalUrl',
                        url: url
                    });
                }
            }
        });
    </script>
</body>
</html>`;
}

function getDependencyTreeHtml(items: BeadItemData[]): string {
  // DEBUG: Log input to HTML generator
  console.log('[getDependencyTreeHtml DEBUG] Received items count:', items?.length ?? 'undefined/null');

  // Build dependency graph
  const nodeMap = new Map<string, BeadItemData>();
  const edges: Array<{from: string, to: string, type: string}> = [];

  // Handle null/undefined items
  if (!items || !Array.isArray(items)) {
    console.error('[getDependencyTreeHtml DEBUG] Items is not a valid array!', typeof items);
    items = [];
  }

  items.forEach((item, idx) => {
    nodeMap.set(item.id, item);
    const raw = item.raw as any;
    const dependencies = raw?.dependencies || [];

    // DEBUG: Log dependency info for first few items
    if (idx < 3) {
      console.log(`[getDependencyTreeHtml DEBUG] Item ${idx} (${item.id}):`, {
        title: item.title,
        status: item.status,
        hasDependencies: dependencies.length > 0,
        dependenciesCount: dependencies.length,
        dependencies: dependencies
      });
    }

    dependencies.forEach((dep: any) => {
      const depType = dep.dep_type || dep.type || 'related';
      const targetId = dep.id || dep.depends_on_id || dep.issue_id;
      if (targetId) {
        edges.push({
          from: item.id,
          to: targetId,
          type: depType
        });
      }
    });
  });

  // DEBUG: Log final graph data
  console.log('[getDependencyTreeHtml DEBUG] Built graph:', {
    nodeCount: nodeMap.size,
    edgeCount: edges.length,
    edges: edges.slice(0, 5)
  });

  // Serialize data for JavaScript, sorted by ID (descending order naturally)
  const sortedNodes = Array.from(nodeMap.entries())
    .sort(([idA], [idB]) => {
      // Extract numeric parts for proper numerical sorting
      const numA = parseInt(idA.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(idB.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    })
    .map(([id, item]) => ({
      id,
      title: item.title,
      status: item.status || 'open'
    }));

  const nodesJson = JSON.stringify(sortedNodes);
  const edgesJson = JSON.stringify(edges);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beads Dependency Tree</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            overflow: hidden;
        }

        #container {
            width: 100%;
            height: calc(100vh - 60px);
            position: relative;
            overflow: auto;
        }

        #canvas {
            position: absolute;
            top: 0;
            left: 0;
            min-width: 100%;
            min-height: 100%;
            z-index: 10;
        }

        .node {
            position: absolute;
            padding: 12px 16px;
            border-radius: 8px;
            border: 2px solid;
            background-color: #1e1e1e;
            cursor: move;
            min-width: 120px;
            text-align: center;
            transition: box-shadow 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 10;
            user-select: none;
        }

        .node:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 20;
        }

        .node.dragging {
            opacity: 0.8;
            z-index: 1000;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
        }

        .node.status-closed {
            border-color: #73c991;
            background-color: #1e1e1e;
        }

        .node.status-in_progress {
            border-color: #f9c513;
            background-color: #1e1e1e;
        }

        .node.status-open {
            border-color: #ff8c00;
            background-color: #1e1e1e;
        }

        .node.status-blocked {
            border-color: #f14c4c;
            background-color: #2d1a1a;
            color: #f14c4c;
        }

        .node-id {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
        }

        .node-title {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
        }

        .node.status-blocked .node-title {
            color: #f14c4c;
            opacity: 0.9;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }

        .status-indicator.closed {
            background-color: #73c991;
        }

        .status-indicator.in_progress {
            background-color: #f9c513;
        }

        .status-indicator.open {
            background-color: #ff8c00;
        }

        .status-indicator.blocked {
            background-color: #f14c4c;
        }

        svg {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 0;
        }

        .edge {
            stroke: var(--vscode-panel-border);
            stroke-width: 2;
            fill: none;
            marker-end: url(#arrowhead);
            opacity: 0.8;
        }

        .edge.blocks {
            stroke: #f14c4c;
            stroke-width: 2.5;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 8px;
        }

        .control-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }

        .control-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .legend {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            font-size: 11px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
        }

        .legend-item:last-child {
            margin-bottom: 0;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button class="control-button" onclick="resetZoom()">Reset View</button>
        <button class="control-button" onclick="autoLayout()">Auto Layout</button>
    </div>

    <div class="legend">
        <div class="legend-item">
            <span class="status-indicator closed"></span>
            <span>Closed</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator in_progress"></span>
            <span>In Progress</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator open"></span>
            <span>Open</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator blocked"></span>
            <span>Blocked</span>
        </div>
    </div>

    <div id="container">
        <svg id="svg"></svg>
        <div id="canvas"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const nodes = ${nodesJson};
        const edges = ${edgesJson};

        console.log('[Dependency Tree] Script started');
        console.log('[Dependency Tree] Loaded', nodes.length, 'nodes and', edges.length, 'edges');
        console.log('[Dependency Tree] Nodes:', JSON.stringify(nodes.slice(0, 5)));
        console.log('[Dependency Tree] Edges:', edges);

        // DEBUG: Show visible indicator if nodes exist
        if (nodes.length === 0) {
            document.body.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--vscode-errorForeground);"><h2>No beads found</h2><p>The visualizer received 0 nodes. Check the Output panel for debug logs.</p></div>';
        }

        const nodeElements = new Map();
        const nodePositions = new Map();

        // Restore previous state if available
        const previousState = vscode.getState() || {};
        let savedPositions = previousState.nodePositions || {};

        // Drag state
        let draggedNode = null;
        let draggedNodeId = null;
        let dragOffset = {x: 0, y: 0};
        let isDragging = false;
        let mouseDownPos = null;

        // Simple tree layout algorithm
        function calculateLayout() {
            const levels = new Map();
            const visited = new Set();
            const outDegree = new Map();

            // Calculate out-degrees (how many dependencies each node has)
            nodes.forEach(node => outDegree.set(node.id, 0));
            edges.forEach(edge => {
                outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
            });

            // Find leaf nodes (nodes with no outgoing edges - no dependencies)
            // These should be at the TOP of the tree
            const leaves = nodes.filter(node => outDegree.get(node.id) === 0);

            // If no leaves, pick nodes with minimal out-degree
            if (leaves.length === 0) {
                const minOutDegree = Math.min(...Array.from(outDegree.values()));
                leaves.push(...nodes.filter(node => outDegree.get(node.id) === minOutDegree));
            }

            // BFS to assign levels, traversing backwards through dependencies
            const queue = leaves.map(node => ({node, level: 0}));
            leaves.forEach(node => visited.add(node.id));

            while (queue.length > 0) {
                const {node, level} = queue.shift();

                if (!levels.has(level)) {
                    levels.set(level, []);
                }
                levels.get(level).push(node);

                // Find parents (nodes that depend on this node)
                const parents = edges
                    .filter(edge => edge.to === node.id)
                    .map(edge => nodes.find(n => n.id === edge.from))
                    .filter(n => n && !visited.has(n.id));

                parents.forEach(parent => {
                    visited.add(parent.id);
                    queue.push({node: parent, level: level + 1});
                });
            }

            // Add unvisited nodes
            nodes.forEach(node => {
                if (!visited.has(node.id)) {
                    const maxLevel = Math.max(...Array.from(levels.keys()), -1);
                    const level = maxLevel + 1;
                    if (!levels.has(level)) {
                        levels.set(level, []);
                    }
                    levels.get(level).push(node);
                }
            });

            // Calculate positions
            const horizontalSpacing = 250;
            const verticalSpacing = 120;
            const startX = 100;
            const startY = 100;

            levels.forEach((nodesInLevel, level) => {
                // Sort nodes within each level by their numeric ID
                const sortedNodes = nodesInLevel.sort((a, b) => {
                    const numA = parseInt(a.id.match(/\\d+/)?.[0] || '0', 10);
                    const numB = parseInt(b.id.match(/\\d+/)?.[0] || '0', 10);
                    return numA - numB;
                });

                sortedNodes.forEach((node, index) => {
                    // Use saved position if available, otherwise calculate
                    if (savedPositions[node.id]) {
                        nodePositions.set(node.id, savedPositions[node.id]);
                    } else {
                        const x = startX + (index * horizontalSpacing);
                        const y = startY + (level * verticalSpacing);
                        nodePositions.set(node.id, {x, y});
                    }
                });
            });
        }

        function savePositions() {
            const positions = {};
            nodePositions.forEach((pos, id) => {
                positions[id] = pos;
            });
            vscode.setState({ nodePositions: positions });
        }

        function createNode(node) {
            const div = document.createElement('div');
            div.className = 'node status-' + node.status;
            div.innerHTML = '<div class="node-id">' +
                '<span class="status-indicator ' + node.status + '"></span>' +
                node.id +
                '</div>' +
                '<div class="node-title" title="' + node.title + '">' + node.title + '</div>';
            div.dataset.nodeId = node.id;

            // Mouse down to prepare for dragging
            div.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only left mouse button

                draggedNode = div;
                draggedNodeId = node.id;
                mouseDownPos = {x: e.clientX, y: e.clientY};

                const pos = nodePositions.get(node.id);
                dragOffset.x = e.clientX - pos.x;
                dragOffset.y = e.clientY - pos.y;

                e.preventDefault();
            });

            // Click to open (only if not dragged)
            div.addEventListener('click', (e) => {
                if (!isDragging) {
                    vscode.postMessage({
                        command: 'openBead',
                        beadId: node.id
                    });
                }
            });

            return div;
        }

        function drawEdge(from, to, type) {
            const fromPos = nodePositions.get(from);
            const toPos = nodePositions.get(to);

            if (!fromPos || !toPos) return '';

            const fromEl = nodeElements.get(from);
            const toEl = nodeElements.get(to);

            if (!fromEl || !toEl) return '';

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const containerRect = document.getElementById('canvas').getBoundingClientRect();

            const x1 = fromPos.x + (fromRect.width / 2);
            const y1 = fromPos.y + fromRect.height;
            const x2 = toPos.x + (toRect.width / 2);
            const y2 = toPos.y;

            // Draw curved line
            const midY = (y1 + y2) / 2;
            const path = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;

            return '<path d="' + path + '" class="edge ' + type + '" />';
        }

        function render() {
            const canvas = document.getElementById('canvas');
            const svg = document.getElementById('svg');

            // Clear
            canvas.innerHTML = '';
            nodeElements.clear();

            // Calculate layout
            calculateLayout();

            // Create nodes
            nodes.forEach(node => {
                const div = createNode(node);
                const pos = nodePositions.get(node.id);
                div.style.left = pos.x + 'px';
                div.style.top = pos.y + 'px';
                canvas.appendChild(div);
                nodeElements.set(node.id, div);
            });

            // Calculate SVG size
            let maxX = 0, maxY = 0;
            nodePositions.forEach(pos => {
                maxX = Math.max(maxX, pos.x + 250);
                maxY = Math.max(maxY, pos.y + 100);
            });

            svg.setAttribute('width', maxX);
            svg.setAttribute('height', maxY);
            canvas.style.width = maxX + 'px';
            canvas.style.height = maxY + 'px';

            // Draw edges
            setTimeout(() => {
                console.log('[Dependency Tree] Drawing', edges.length, 'edges');
                const edgePaths = edges.map(edge =>
                    drawEdge(edge.from, edge.to, edge.type)
                ).join('');

                console.log('[Dependency Tree] Edge paths generated:', edgePaths.substring(0, 200));
                svg.innerHTML = '<defs>' +
                    '<marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">' +
                    '<polygon points="0 0, 10 3, 0 6" fill="var(--vscode-panel-border)" />' +
                    '</marker>' +
                    '</defs>' +
                    edgePaths;
                console.log('[Dependency Tree] SVG innerHTML set');
            }, 100);
        }

        function resetZoom() {
            const container = document.getElementById('container');

            // Calculate bounding box of all nodes
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            nodePositions.forEach(pos => {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 250); // account for node width
                maxY = Math.max(maxY, pos.y + 100); // account for node height
            });

            // Calculate center point
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            // Calculate viewport center
            const viewportCenterX = container.clientWidth / 2;
            const viewportCenterY = container.clientHeight / 2;

            // Scroll to center the graph
            container.scrollTo({
                left: centerX - viewportCenterX,
                top: centerY - viewportCenterY,
                behavior: 'smooth'
            });
        }

        function autoLayout() {
            // Clear saved positions and re-render
            vscode.setState({ nodePositions: {} });
            savedPositions = {};
            nodePositions.clear();
            render();
        }

        function redrawEdges() {
            const svg = document.getElementById('svg');
            const edgePaths = edges.map(edge =>
                drawEdge(edge.from, edge.to, edge.type)
            ).join('');

            svg.innerHTML = '<defs>' +
                '<marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">' +
                '<polygon points="0 0, 10 3, 0 6" fill="var(--vscode-panel-border)" />' +
                '</marker>' +
                '</defs>' +
                edgePaths;
        }

        // Global mouse move handler for dragging
        document.addEventListener('mousemove', (e) => {
            if (!draggedNode || !draggedNodeId) return;

            // Check if mouse has moved enough to start dragging (5px threshold)
            if (!isDragging && mouseDownPos) {
                const dx = e.clientX - mouseDownPos.x;
                const dy = e.clientY - mouseDownPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 5) {
                    isDragging = true;
                    draggedNode.classList.add('dragging');
                }
            }

            if (!isDragging) return;

            const container = document.getElementById('container');
            const scrollLeft = container.scrollLeft;
            const scrollTop = container.scrollTop;

            // Calculate new position
            const x = e.clientX - dragOffset.x + scrollLeft;
            const y = e.clientY - dragOffset.y + scrollTop;

            // Update position
            nodePositions.set(draggedNodeId, {x, y});
            draggedNode.style.left = x + 'px';
            draggedNode.style.top = y + 'px';

            // Redraw edges in real-time
            redrawEdges();
        });

        // Global mouse up handler to end dragging
        document.addEventListener('mouseup', (e) => {
            if (draggedNode) {
                draggedNode.classList.remove('dragging');
            }

            if (isDragging) {
                // Save positions to state after dragging
                savePositions();
            }

            // Reset drag state
            draggedNode = null;
            draggedNodeId = null;
            mouseDownPos = null;
            isDragging = false;
        });

        // Initial render with error handling
        try {
            console.log('[Dependency Tree] Starting initial render...');
            render();
            console.log('[Dependency Tree] Initial render completed');
        } catch (err) {
            console.error('[Dependency Tree] Render error:', err);
            document.body.innerHTML = '<div style="padding: 40px; color: var(--vscode-errorForeground);"><h2>Render Error</h2><pre>' + err.message + '</pre></div>';
        }
    </script>
</body>
</html>`;
}

async function openBead(item: BeadItemData, provider: BeadsTreeDataProvider): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'beadDetail',
    item.id,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get all items from the provider to calculate reverse dependencies
  const allItems = provider['items'] as BeadItemData[];
  panel.webview.html = getBeadDetailHtml(item, allItems);

  // Register this panel so it can be refreshed when data changes
  provider.registerPanel(item.id, panel);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'updateStatus': {
          await provider.updateStatus(item, message.status);
          break;
        }
        case 'updateTitle': {
          await provider.updateTitle(item, message.title);
          break;
        }
        case 'addLabel': {
          await provider.addLabel(item, message.label);
          break;
        }
        case 'removeLabel': {
          await provider.removeLabel(item, message.label);
          break;
        }
        case 'openBead': {
          // Find the bead with the specified ID
          const targetBead = allItems.find(i => i.id === message.beadId);
          if (targetBead) {
            await openBead(targetBead, provider);
          } else {
            void vscode.window.showWarningMessage(`Issue ${message.beadId} not found`);
          }
          break;
        }
        case 'openExternalUrl': {
          // Open external URL in default browser
          const url = message.url;
          if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          }
          break;
        }
      }
    }
  );
}

async function createBead(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a title for the new bead',
    placeHolder: 'Implement feature X',
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beads');
  const projectRoot = resolveProjectRoot(config);

  try {
    await runBdCommand(['create', name], projectRoot!, true);
    void vscode.commands.executeCommand('beads.refresh');
    void vscode.window.showInformationMessage(`Created bead: ${name}`);
  } catch (error) {
    void vscode.window.showErrorMessage(formatError('Failed to create bead', error));
  }
}

async function visualizeDependencies(provider: BeadsTreeDataProvider): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'beadDependencyTree',
    'Beads Dependency Tree',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get all items from the provider
  const items = provider['items'] as BeadItemData[];

  // DEBUG: Log the items being passed to the visualizer
  console.log('[Visualizer DEBUG] Number of items from provider:', items?.length ?? 'undefined');
  console.log('[Visualizer DEBUG] Items array:', JSON.stringify(items?.slice(0, 3), null, 2)); // First 3 items
  if (items && items.length > 0) {
    console.log('[Visualizer DEBUG] First item raw data:', JSON.stringify(items[0]?.raw, null, 2));
  }

  panel.webview.html = getDependencyTreeHtml(items);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'openBead': {
          const item = items.find((i: BeadItemData) => i.id === message.beadId);
          if (item) {
            await openBead(item, provider);
          }
          break;
        }
      }
    }
  );
}

function getActivityFeedPanelHtml(events: import('./activityFeed').EventData[]): string {
  const eventCards = events.map(event => {
    const iconMap: Record<string, string> = {
      'sparkle': '✨',
      'check': '✓',
      'sync': '↻',
      'git-merge': '⑂',
      'git-compare': '⌥',
      'edit': '✏',
      'note': '📝',
      'flame': '🔥',
      'tag': '🏷',
      'close': '✕',
      'person-add': '👤+',
      'person': '👤',
      'comment': '💬',
      'history': '↺',
      'question': '?',
    };
    const colorMap: Record<string, string> = {
      'event-created': '#f9c513',
      'event-success': '#73c991',
      'event-warning': '#f9c513',
      'event-info': '#3794ff',
      'event-purple': '#a855f7',
      'event-default': '#666',
    };
    const icon = iconMap[event.iconName] || '•';
    const color = colorMap[event.colorClass] || '#666';
    const time = event.createdAt.toLocaleString();
    
    return `
      <div class="event-card" data-issue-id="${escapeHtml(event.issueId)}">
        <div class="timeline-dot" style="background-color: ${color};">${icon}</div>
        <div class="event-content">
          <div class="event-header">
            <span class="event-description">${escapeHtml(event.description)}</span>
            <span class="event-time" title="${time}">${escapeHtml(event.createdAt.toLocaleTimeString())}</span>
          </div>
          ${event.issueTitle ? `<div class="event-issue">${escapeHtml(event.issueTitle)}</div>` : ''}
          <div class="event-meta">
            <span class="event-actor">by ${escapeHtml(event.actor)}</span>
            <span class="event-id">#${escapeHtml(event.issueId)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Activity Feed</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            line-height: 1.5;
        }
        
        .activity-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .activity-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }
        
        .event-count {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .timeline {
            position: relative;
            padding-left: 40px;
        }
        
        .timeline::before {
            content: '';
            position: absolute;
            left: 16px;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: var(--vscode-panel-border);
        }
        
        .event-card {
            position: relative;
            margin-bottom: 16px;
            padding: 12px 16px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(-10px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        .event-card:hover {
            background-color: var(--vscode-list-hoverBackground);
            transform: translateX(4px);
        }
        
        .timeline-dot {
            position: absolute;
            left: -32px;
            top: 14px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            border: 2px solid var(--vscode-editor-background);
        }
        
        .event-content {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .event-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        
        .event-description {
            font-weight: 500;
            flex: 1;
        }
        
        .event-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
            white-space: nowrap;
        }
        
        .event-issue {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .event-meta {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        .event-id {
            color: var(--vscode-textLink-foreground);
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
        
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="activity-header">
        <h1 class="activity-title">Activity Feed</h1>
        <span class="event-count">${events.length} events</span>
    </div>
    
    ${events.length > 0 ? `
    <div class="timeline">
        ${eventCards}
    </div>
    ` : `
    <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No activity yet</h3>
        <p>Events will appear here as you work with issues.</p>
    </div>
    `}
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.querySelectorAll('.event-card').forEach(card => {
            card.addEventListener('click', () => {
                const issueId = card.getAttribute('data-issue-id');
                if (issueId) {
                    vscode.postMessage({
                        command: 'openBead',
                        beadId: issueId
                    });
                }
            });
        });
    </script>
</body>
</html>`;
}

async function openActivityFeedPanel(activityFeedProvider: ActivityFeedTreeDataProvider, beadsProvider: BeadsTreeDataProvider): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'activityFeedPanel',
    'Activity Feed',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get events from the provider
  const projectRoot = vscode.workspace.getConfiguration('beads').get<string>('projectRoot') ||
    (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
  
  const { fetchEvents } = await import('./activityFeed');
  const result = await fetchEvents(projectRoot, { limit: 100 });

  // 
  panel.webview.html = getActivityFeedPanelHtml(result.events);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'openBead': {
          const items = beadsProvider['items'] as BeadItemData[];
          const item = items.find((i: BeadItemData) => i.id === message.beadId);
          if (item) {
            await openBead(item, beadsProvider);
          } else {
            // If item not found in current view, just show a message
            void vscode.window.showInformationMessage(`Opening issue ${message.beadId}`);
          }
          break;
        }
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BeadsTreeDataProvider(context);
  const treeView = vscode.window.createTreeView('beadsExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    canSelectMany: true,
  });

  // Set tree view reference for badge updates
  provider.setTreeView(treeView);

  // Track expand/collapse to update icons and persist state
  const expandListener = treeView.onDidExpandElement(event => {
    provider.handleCollapseChange(event.element, false);
  });
  const collapseListener = treeView.onDidCollapseElement(event => {
    provider.handleCollapseChange(event.element, true);
  });

  // Create and register status bar item for stale count
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  provider.setStatusBarItem(statusBarItem);
  context.subscriptions.push(statusBarItem);

  // Register provider disposal
  context.subscriptions.push({ dispose: () => provider.dispose() });

  // Activity Feed Provider
  const activityFeedProvider = new ActivityFeedTreeDataProvider(context);
  const activityFeedView = vscode.window.createTreeView('activityFeed', {
    treeDataProvider: activityFeedProvider,
  });

  context.subscriptions.push(
    treeView,
    expandListener,
    collapseListener,
    activityFeedView,
    vscode.commands.registerCommand('beads.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beads.search', () => provider.search()),
    vscode.commands.registerCommand('beads.clearSearch', () => provider.clearSearch()),
    vscode.commands.registerCommand('beads.clearSortOrder', () => provider.clearSortOrder()),
    vscode.commands.registerCommand('beads.toggleSortMode', () => provider.toggleSortMode()),
    vscode.commands.registerCommand('beads.openBead', (item: BeadItemData) => openBead(item, provider)),
    vscode.commands.registerCommand('beads.createBead', () => createBead()),
    vscode.commands.registerCommand('beads.visualizeDependencies', () => visualizeDependencies(provider)),
    
    // Activity Feed commands
    vscode.commands.registerCommand('beads.refreshActivityFeed', () => activityFeedProvider.refresh()),
    vscode.commands.registerCommand('beads.filterActivityFeed', async () => {
      const options: vscode.QuickPickItem[] = [
        { label: 'All Events', description: 'Show all event types' },
        { label: 'Created', description: 'Show issue creation events' },
        { label: 'Closed', description: 'Show issue closed events' },
        { label: 'Status Changes', description: 'Show status change events' },
        { label: 'Dependencies', description: 'Show dependency events' },
        { label: 'Today', description: 'Show events from today' },
        { label: 'This Week', description: 'Show events from this week' },
        { label: 'This Month', description: 'Show events from this month' },
      ];

      const selection = await vscode.window.showQuickPick(options, {
        placeHolder: 'Filter activity feed by...',
      });

      if (!selection) {
        return;
      }

      switch (selection.label) {
        case 'All Events':
          activityFeedProvider.clearFilters();
          break;
        case 'Created':
          activityFeedProvider.setEventTypeFilter(['created'] as EventType[]);
          break;
        case 'Closed':
          activityFeedProvider.setEventTypeFilter(['closed'] as EventType[]);
          break;
        case 'Status Changes':
          activityFeedProvider.setEventTypeFilter(['status_changed'] as EventType[]);
          break;
        case 'Dependencies':
          activityFeedProvider.setEventTypeFilter(['dependency_added', 'dependency_removed'] as EventType[]);
          break;
        case 'Today':
          activityFeedProvider.setTimeRangeFilter('today');
          break;
        case 'This Week':
          activityFeedProvider.setTimeRangeFilter('week');
          break;
        case 'This Month':
          activityFeedProvider.setTimeRangeFilter('month');
          break;
      }
    }),
    vscode.commands.registerCommand('beads.clearActivityFeedFilter', () => {
      activityFeedProvider.clearFilters();
      void vscode.window.showInformationMessage('Activity feed filter cleared');
    }),
    vscode.commands.registerCommand('beads.openActivityFeedPanel', () => 
      openActivityFeedPanel(activityFeedProvider, provider)
    ),

    vscode.commands.registerCommand('beads.editExternalReference', async (item: BeadItemData) => {
      if (!item) {
        return;
      }

      // Construct the current value from ID and description
      const currentValue = item.externalReferenceId
        ? (item.externalReferenceDescription
          ? `${item.externalReferenceId}:${item.externalReferenceDescription}`
          : item.externalReferenceId)
        : '';

      const newValue = await vscode.window.showInputBox({
        prompt: 'Set the external reference for this bead (format: ID:description)',
        value: currentValue,
        placeHolder: 'Enter "ID:description" or leave empty to remove',
      });

      if (newValue === undefined) {
        return;
      }

      await provider.updateExternalReference(item, newValue.trim().length > 0 ? newValue.trim() : undefined);
    }),
    vscode.commands.registerCommand('beads.deleteBeads', async () => {
      // Get selected items from tree view
      const selection = treeView.selection;

      if (!selection || selection.length === 0) {
        void vscode.window.showWarningMessage('No beads selected');
        return;
      }
      
      // Filter for BeadTreeItems only (not StatusSectionItems)
      const beadItems = selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
      if (beadItems.length === 0) {
        void vscode.window.showWarningMessage('No beads selected (only status sections selected)');
        return;
      }

      // Build confirmation message with list of beads
      const beadsList = beadItems
        .map(item => `  • ${item.bead.id} - ${item.bead.title}`)
        .join('\n');

      const message = beadItems.length === 1
        ? `Are you sure you want to delete this bead?\n\n${beadsList}`
        : `Are you sure you want to delete these ${beadItems.length} beads?\n\n${beadsList}`;

      // Show confirmation dialog
      const answer = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Delete'
      );

      if (answer !== 'Delete') {
        return;
      }

      // Delete each bead
      const config = vscode.workspace.getConfiguration('beads');
      const projectRoot = resolveProjectRoot(config) || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());

      try {
        // Delete beads one by one with guard
        for (const item of beadItems) {
          await runBdCommand(['delete', item.bead.id, '--force'], projectRoot!, true);
        }

        await provider.refresh();

        const successMessage = beadItems.length === 1
          ? `Deleted bead: ${beadItems[0].bead.id}`
          : `Deleted ${beadItems.length} beads`;
        void vscode.window.showInformationMessage(successMessage);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Failed to delete beads: ${errorMessage}`);
      }
    }),
  );

  void provider.refresh();
}

export function deactivate(): void {
  // no-op
}

// Expose core classes for unit testing
export { BeadsTreeDataProvider, BeadTreeItem, EpicTreeItem, UngroupedSectionItem };
