import * as vscode from 'vscode';
import {
  BeadItemData,
  formatError,
  formatSafeError,
  sanitizeErrorMessage,
  sanitizeInlineText,
  escapeHtml,
  linkifyText,
  isStale,
  validateDependencyAdd,
  sanitizeDependencyId,
  collectCliErrorOutput,
  writeBeadsMarkdownFile,
  MarkdownExportHeaders,
  writeBeadsCsvFile,
  CsvExportHeaders,
  validateStatusChange,
  formatStatusLabel,
  compareStatus,
  formatPriorityLabel,
  buildBulkSelection,
  executeBulkStatusUpdate,
  executeBulkLabelUpdate,
  summarizeBulkResult,
  BulkLabelAction,
  BulkOperationFailure,
  BulkOperationResult,
  getFavoriteLabel,
  getLocalFavorites,
  saveLocalFavorites,
  sanitizeFavoriteLabel,
  isValidFavoriteLabel,
  validateFavoriteTargets,
  sanitizeFavoriteError,
  syncFavoritesState,
  validateTitleInput,
  validateLabelInput,
  validateStatusInput,
  validateAssigneeInput,
  collectDependencyEdges,
  GraphEdgeData,
  buildDependencyTrees,
  QuickFilterPreset,
  applyQuickFilter,
  toggleQuickFilter,
  normalizeQuickFilter,
} from './utils';
import { ActivityFeedTreeDataProvider, ActivityEventItem } from './activityFeedProvider';
import { EventType } from './activityFeed';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from './littleGlen/validation';
import {
  AssigneeSectionItem,
  BeadTreeItem,
  BeadDetailItem,
  EpicTreeItem,
  StatusSectionItem,
  SummaryHeaderItem,
  UngroupedSectionItem,
  WarningSectionItem,
  EpicStatusSectionItem,
  getAssigneeInfo,
} from './providers/beads/items';
import {
  BeadsDocument,
  BeadsStore,
  BeadsStoreSnapshot,
  WorkspaceTarget,
  WatcherManager,
  createBeadsStore,
  createWorkspaceTarget,
  createVsCodeWatchAdapter,
  findBdCommand,
  naturalSort,
  saveBeadsDocument,
} from './providers/beads/store';
import { resolveProjectRoot, getWorkspaceOptions, findWorkspaceById, loadSavedWorkspaceSelection, saveWorkspaceSelection } from './utils/workspace';
import { computeFeedbackEnablement } from './feedback/enablement';
import { getBulkActionsConfig } from './utils/config';
import { registerSendFeedbackCommand } from './commands/sendFeedback';
import { CommandRegistry, createExportCommands, createQuickFilterCommands } from './commands';
import { createDependencyGraphView } from './views';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { BeadsWebviewProvider } from './providers/beads/webview';
import { currentWorktreeId } from './worktree';
import { warnIfDependencyEditingUnsupported } from './services/runtimeEnvironment';
import { BdCommandOptions, formatBdError, resolveBeadId, runBdCommand } from './services/cliService';
import * as path from 'path';
import { registerChatParticipants } from './chatAgents';

const t = vscode.l10n.t;
const PROJECT_ROOT_ERROR = t('Unable to resolve project root. Set "beady.projectRoot" or open a workspace folder.');
const INVALID_ID_MESSAGE = t('Issue ids must contain only letters, numbers, ._- and be under 64 characters.');
const ASSIGNEE_MAX_LENGTH = 64;

function validationMessage(kind: 'title' | 'label' | 'status' | 'assignee', reason?: string): string {
  switch (reason) {
    case 'empty':
      return kind === 'title' ? t('Title cannot be empty.') : t('Label cannot be empty.');
    case 'too_long':
      if (kind === 'title') {
        return t('Title must be 1-{0} characters without new lines.', 256);
      }
      if (kind === 'label') {
        return t('Label must be 1-{0} characters.', 64);
      }
      return t('Assignee must be 0-{0} characters.', ASSIGNEE_MAX_LENGTH);
    case 'invalid_characters':
      return t('The {0} contains unsupported characters.', kind);
    case 'invalid_status':
      return t('Status update blocked: invalid status.');
    case 'already in target status':
      return t('Status update blocked: already in target status.');
    default:
      return t('Invalid {0} value.', kind);
  }
}


function createNonce(): string {  
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15);
}

const STATUS_SECTION_ORDER: string[] = ['in_progress', 'open', 'blocked', 'closed'];
const DEFAULT_COLLAPSED_SECTION_KEYS: string[] = [...STATUS_SECTION_ORDER, 'ungrouped'];
type TreeItemType = SummaryHeaderItem | StatusSectionItem | WarningSectionItem | EpicStatusSectionItem | AssigneeSectionItem | EpicTreeItem | UngroupedSectionItem | BeadTreeItem | BeadDetailItem;

type StatusLabelMap = {
  open: string;
  in_progress: string;
  blocked: string;
  closed: string;
};

interface BeadDetailStrings {
  dependencyTreeTitle: string;
  dependencyTreeUpstream: string;
  dependencyTreeDownstream: string;
  addUpstreamLabel: string;
  addDownstreamLabel: string;
  addUpstreamPrompt: string;
  addDownstreamPrompt: string;
  dependencyEmptyLabel: string;
  missingDependencyLabel: string;
  editLabel: string;
  editAssigneeLabel: string;
  deleteLabel: string;
  doneLabel: string;
  descriptionLabel: string;
  designLabel: string;
  acceptanceLabel: string;
  notesLabel: string;
  detailsLabel: string;
  assigneeLabel: string;
  assigneeFallback: string;
  externalRefLabel: string;
  createdLabel: string;
  updatedLabel: string;
  closedLabel: string;
  labelsLabel: string;
  noLabelsLabel: string;
  markInReviewLabel: string;
  removeInReviewLabel: string;
  addLabelLabel: string;
  addDependencyLabel: string;
  removeDependencyLabel: string;
  dependsOnLabel: string;
  blocksLabel: string;
  labelPrompt: string;
  statusLabels: StatusLabelMap;
  statusBadgeAriaLabel: string;
  statusDropdownLabel: string;
  statusOptionAriaLabel: string;
}

interface DependencyTreeStrings {
  title: string;
  resetView: string;
  autoLayout: string;
  removeDependencyLabel: string;
  legendClosed: string;
  legendInProgress: string;
  legendOpen: string;
  legendBlocked: string;
  emptyTitle: string;
  emptyDescription: string;
  renderErrorTitle: string;
}

interface ActivityFeedStrings {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  eventsLabel: string;
}

type DependencyEdge = GraphEdgeData;

const getStatusLabels = (): StatusLabelMap => ({
  open: t('Open'),
  in_progress: t('In Progress'),
  blocked: t('Blocked'),
  closed: t('Closed'),
});

const buildBeadDetailStrings = (statusLabels: StatusLabelMap): BeadDetailStrings => ({
  dependencyTreeTitle: t('Dependency Tree'),
  dependencyTreeUpstream: t('↑ Depends On (upstream)'),
  dependencyTreeDownstream: t('↓ Blocked By This (downstream)'),
  addUpstreamLabel: t('Add upstream'),
  addDownstreamLabel: t('Add downstream'),
  addUpstreamPrompt: t('Enter the ID this issue depends on'),
  addDownstreamPrompt: t('Enter the ID that should depend on this issue'),
  dependencyEmptyLabel: t('No dependencies yet'),
  missingDependencyLabel: t('Missing issue'),
  editLabel: t('Edit issue details'),
  editAssigneeLabel: t('Edit Assignee'),
  deleteLabel: t('Delete issue'),
  doneLabel: t('Done'),
  descriptionLabel: t('Description'),
  designLabel: t('Design'),
  acceptanceLabel: t('Acceptance Criteria'),
  notesLabel: t('Notes'),
  detailsLabel: t('Details'),
  assigneeLabel: t('Assignee:'),
  assigneeFallback: t('Unassigned'),
  externalRefLabel: t('External Ref:'),
  createdLabel: t('Created:'),
  updatedLabel: t('Updated:'),
  closedLabel: t('Closed:'),
  labelsLabel: t('Labels'),
  noLabelsLabel: t('No labels'),
  markInReviewLabel: t('Mark as In Review'),
  removeInReviewLabel: t('Remove In Review'),
  addLabelLabel: t('Add Label'),
  addDependencyLabel: t('Add Dependency'),
  removeDependencyLabel: t('Remove Dependency'),
  dependsOnLabel: t('Depends On'),
  blocksLabel: t('Blocks'),
  labelPrompt: t('Enter label name:'),
  statusLabels,
  statusBadgeAriaLabel: t('Status: {0}. Activate to change.'),
  statusDropdownLabel: t('Status options'),
  statusOptionAriaLabel: t('Set status to {0}'),
});

const buildActivityFeedStrings = (): ActivityFeedStrings => ({
  title: t('Activity Feed'),
  emptyTitle: t('No activity yet'),
  emptyDescription: t('Events will appear here as you work with issues.'),
  eventsLabel: t('events'),
});


interface InProgressPanelStrings {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  wipLabel: string;
  wipSubtitle: string;
  blockersLabel: string;
  blockedItemsLabel: string;
  topAssigneesLabel: string;
  oldestLabel: string;
  listTitle: string;
  assigneeFallback: string;
  ageLabel: string;
  blockersCountLabel: string;
  openLabel: string;
}

const buildInProgressPanelStrings = (): InProgressPanelStrings => ({
  title: t('In Progress Spotlight'),
  emptyTitle: t('No work in progress'),
  emptyDescription: t('Issues move here once their status is set to In Progress.'),
  wipLabel: t('In Progress'),
  wipSubtitle: t('Items currently in progress'),
  blockersLabel: t('Blockers'),
  blockedItemsLabel: t('items with blockers'),
  topAssigneesLabel: t('Top assignees'),
  oldestLabel: t('Oldest tasks'),
  listTitle: t('In Progress items'),
  assigneeFallback: t('Unassigned'),
  ageLabel: t('Age'),
  blockersCountLabel: t('Blockers'),
  openLabel: t('Open'),
});

class BeadsTreeDataProvider implements vscode.TreeDataProvider<TreeItemType>, vscode.TreeDragAndDropController<TreeItemType> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeItemType | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  // Drag and drop support
  readonly dropMimeTypes = ['application/vnd.code.tree.beadyExplorer'];
  readonly dragMimeTypes = ['application/vnd.code.tree.beadyExplorer'];

  private items: BeadItemData[] = [];
  private document: BeadsDocument | undefined;
  private readonly watchManager: WatcherManager;
  private readonly store: BeadsStore;
  private storeSubscription?: () => void;
  private primaryConfigForFavorites: vscode.WorkspaceConfiguration | undefined;
  private openPanels: Map<string, vscode.WebviewPanel> = new Map();
  private panelHashes: Map<string, string> = new Map();
  private searchQuery: string = '';
  private refreshInProgress: boolean = false;
  private quickFilter: QuickFilterPreset | undefined;
  private pendingRefresh: boolean = false;
  private staleRefreshTimer: NodeJS.Timeout | undefined;
  private treeView: vscode.TreeView<TreeItemType> | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private feedbackEnabled: boolean = false;
  private lastStaleCount: number = 0;
  private lastThresholdMinutes: number = 10;
  private showClosed: boolean = true;

  // Workspace selection
  private activeWorkspaceId: string = 'all';
  private activeWorkspaceFolder: vscode.WorkspaceFolder | undefined;

  // Manual sort order: Map<issueId, sortIndex>
  private manualSortOrder: Map<string, number> = new Map();

  // Sort mode: 'id' (natural ID sort), 'status' (group by status), or 'epic' (group by parent epic)
  private sortMode: 'id' | 'status' | 'epic' | 'assignee' = 'id';
  private sortPickerEnabled = true;
  
  // Collapsed state for status sections
  private collapsedSections: Set<string> = new Set(DEFAULT_COLLAPSED_SECTION_KEYS);
  // Collapsed state for epics (id -> collapsed)
  private collapsedEpics: Map<string, boolean> = new Map();
  // Collapsed state for assignee sections
  private collapsedAssignees: Map<string, boolean> = new Map();
  // Expanded state for bead rows (id -> expanded)
  private expandedRows: Set<string> = new Set();

  constructor(private readonly context: vscode.ExtensionContext, watchManager?: WatcherManager) {
    this.watchManager = watchManager ?? new WatcherManager(createVsCodeWatchAdapter());
    this.store = createBeadsStore({ watchManager: this.watchManager });
    this.storeSubscription = this.store.onDidChange((snapshot) => {
      void this.applyStoreSnapshot(snapshot);
    });
    // Load persisted sort order
    this.loadSortOrder();
    // Load persisted sort mode
    this.loadSortMode();
    // Load persisted collapsed sections
    this.loadCollapsedSections();
    // Load persisted assignee collapse state
    this.loadCollapsedAssignees();
    // Load persisted expanded rows
    this.loadExpandedRows();
    // Load quick filter preset
    this.loadQuickFilter();
    // Load closed visibility toggle
    this.loadClosedVisibility();
    // Restore workspace selection
    this.restoreWorkspaceSelection();
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
    this.storeSubscription?.();
    this.store.dispose();
  }

  setTreeView(treeView: vscode.TreeView<TreeItemType>): void {
    this.treeView = treeView;
    this.updateQuickFilterUi();
    this.updateSortDescription();
    this.syncClosedVisibilityContext();
  }

  setStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    this.statusBarItem = statusBarItem;
  }

  setFeedbackEnabled(enabled: boolean): void {
    this.feedbackEnabled = enabled;
    this.updateStatusBar(this.lastStaleCount, this.lastThresholdMinutes);
  }

  private updateBadge(): void {
    if (!this.treeView) {
      return;
    }

    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beady');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;

    // Count stale in_progress items
    const staleCount = this.items.filter(item => isStale(item, thresholdHours)).length;

    if (staleCount > 0) {
      const badgeTooltip = t('{0} stale task{1} (in progress > {2} min)', staleCount, staleCount !== 1 ? 's' : '', thresholdMinutes);
      this.treeView.badge = {
        tooltip: badgeTooltip,
        value: staleCount
      };
    } else {
      this.treeView.badge = undefined;
    }

    // Also update status bar
    this.updateStatusBar(staleCount, thresholdMinutes);
  }

  private updateStatusBar(staleCount: number, thresholdMinutes: number): void {
    this.lastStaleCount = staleCount;
    this.lastThresholdMinutes = thresholdMinutes;

    if (!this.statusBarItem) {
      return;
    }

    if (staleCount > 0) {
      this.statusBarItem.text = `$(warning) ${staleCount} stale task${staleCount !== 1 ? 's' : ''}`;
      this.statusBarItem.tooltip = t('{0} task{1} in progress for more than {2} minutes. Click to view.',
        staleCount,
        staleCount !== 1 ? 's' : '',
        thresholdMinutes);
      this.statusBarItem.command = 'beadyExplorer.focus';
      this.statusBarItem.show();
      return;
    }

    if (this.feedbackEnabled) {
      this.statusBarItem.text = `$(comment-discussion) ${t('Send Feedback')}`;
      this.statusBarItem.tooltip = t('Share feedback or report a bug (opens GitHub)');
      this.statusBarItem.command = 'beady.sendFeedback';
      this.statusBarItem.show();
      return;
    }

    this.statusBarItem.hide();
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
    
    if (element instanceof EpicStatusSectionItem) {
      return element.epics;
    }

    if (element instanceof AssigneeSectionItem) {
      return element.beads.map((item) => this.createTreeItem(item));
    }
    
    if (element instanceof EpicTreeItem) {
      return element.children.map((item) => this.createTreeItem(item));
    }

    if (element instanceof UngroupedSectionItem) {
      return element.children.map((item) => this.createTreeItem(item));
    }
    
    if (element instanceof BeadTreeItem) {
      return element.getDetails();
    }

    // Root level
    if (this.items.length === 0) {
      await this.refresh();
    }

    const filteredItems = this.filterItems(this.items);
    const header = filteredItems.length > 0 ? [this.buildSummaryHeader(filteredItems)] : [];
    
    if (this.sortMode === 'status') {
      return [...header, ...this.createStatusSections(filteredItems)];
    }
    
    if (this.sortMode === 'epic') {
      return [...header, ...this.createEpicTree(filteredItems)];
    }

    if (this.sortMode === 'assignee') {
      return [...header, ...this.createAssigneeSections(filteredItems)];
    }
    
    const sortedItems = this.applySortOrder(filteredItems);
    return header.concat(sortedItems.map((item) => this.createTreeItem(item)));
  }
  
  private buildSummaryHeader(items: BeadItemData[]): SummaryHeaderItem {
    const total = items.length;
    const counts: Record<string, number> = { open: 0, in_progress: 0, blocked: 0, closed: 0 };
    items.forEach((item) => {
      const status = item.status || 'open';
      if (counts[status] !== undefined) {
        counts[status] += 1;
      }
    });

    let unassigned = 0;
    const assignees = new Set<string>();
    items.forEach((item) => {
      const name = deriveAssigneeName(item, '').trim();
      if (name) {
        assignees.add(name.toLowerCase());
      } else {
        unassigned += 1;
      }
    });

    const description = t('{0} items · Open {1} · In Progress {2} · Blocked {3} · Closed {4} · Assignees {5} · Unassigned {6}',
      total, counts.open ?? 0, counts.in_progress ?? 0, counts.blocked ?? 0, counts.closed ?? 0, assignees.size, unassigned);

    const accessibilityLabel = t('Issues summary: {0}', description);
    return new SummaryHeaderItem(t('Issues Summary'), description, description, accessibilityLabel);
  }

  private createStatusSections(items: BeadItemData[]): (StatusSectionItem | WarningSectionItem)[] {
    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beady');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    
    // Find stale items
    const staleItems = items.filter(item => item.status !== 'closed' && isStale(item, thresholdHours));
    
    // Group items by status
    const grouped: Record<string, BeadItemData[]> = {};
    
    STATUS_SECTION_ORDER.forEach(status => {
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
    
    const orderedStatuses = [
      ...STATUS_SECTION_ORDER,
      ...Object.keys(grouped).filter(status => !STATUS_SECTION_ORDER.includes(status))
    ];

    // Add status sections for non-empty groups in desired order
    orderedStatuses.forEach(status => {
      const bucket = grouped[status];
      if (!bucket || bucket.length === 0) {
        return;
      }
      const isCollapsed = this.collapsedSections.has(status);
      sections.push(new StatusSectionItem(status, bucket, isCollapsed));
    });
    
    return sections;
  }
  
  private createEpicTree(items: BeadItemData[]): (EpicStatusSectionItem | UngroupedSectionItem | WarningSectionItem | EpicTreeItem)[] {
    // Get stale threshold from configuration (in minutes, convert to hours for isStale)
    const config = vscode.workspace.getConfiguration('beady');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    
    // Find stale items so we can surface them above the tree (tasks only)
    const staleItems = items.filter(
      item => item.issueType !== 'epic' && item.status !== 'closed' && isStale(item, thresholdHours)
    );
    
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
    
    const sections: (EpicStatusSectionItem | UngroupedSectionItem | WarningSectionItem | EpicTreeItem)[] = [];

    const emptyEpics: BeadItemData[] = [];
    const statusBuckets: Record<string, EpicTreeItem[]> = {};
    STATUS_SECTION_ORDER.forEach(status => {
      statusBuckets[status] = [];
    });

    // Sort epics and assign to buckets (skip empty for main buckets)
    const sortedEpics = Array.from(epicMap.values()).sort(naturalSort);
    sortedEpics.forEach(epic => {
      const children = childrenMap.get(epic.id) || [];
      const status = epic.status || 'open';
      const epicItem = new EpicTreeItem(epic, children, this.collapsedEpics.get(epic.id) === true);

      if (children.length === 0 && status !== 'closed') {
        emptyEpics.push(epic);
        return;
      }

      if (!statusBuckets[status]) {
        statusBuckets[status] = [];
      }
      statusBuckets[status].push(epicItem);
    });

    // Warning bucket: stale tasks + empty epics
    const warningItems = [...staleItems, ...emptyEpics];
    if (warningItems.length > 0) {
      const isCollapsed = this.collapsedSections.has('stale');
      sections.push(new WarningSectionItem(warningItems, thresholdMinutes, isCollapsed));
    }

    // Status-ordered epic sections
    const statusOrder = STATUS_SECTION_ORDER;
    statusOrder.forEach(status => {
      const epics = statusBuckets[status] || [];
      if (epics.length === 0) {
        return;
      }
      const isCollapsed = this.collapsedSections.has(status);
      sections.push(new EpicStatusSectionItem(status, epics, isCollapsed));
    });

    // Ungrouped bucket at the end
    if (ungrouped.length > 0) {
      const isCollapsed = this.collapsedSections.has('ungrouped');
      sections.push(new UngroupedSectionItem(ungrouped, isCollapsed));
    }
    
    return sections;
  }

  private createAssigneeSections(items: BeadItemData[]): AssigneeSectionItem[] {
    const fallback = t('Unassigned');
    const UNASSIGNED_KEY = '__unassigned__';
    const groups = new Map<string, { beads: BeadItemData[]; display: string; dot: string }>();

    items.forEach((item) => {
      const rawName = deriveAssigneeName(item, fallback);
      const safeName = sanitizeInlineText(rawName).trim();
      const key = safeName.length > 0 ? safeName.toLowerCase() : UNASSIGNED_KEY;
      const display = safeName.length > 0 ? safeName : fallback;
      const info = getAssigneeInfo(item);

      const existing = groups.get(key);
      if (existing) {
        existing.beads.push(item);
      } else {
        groups.set(key, { beads: [item], display: info.name || display, dot: info.dot });
      }
    });

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === b) {
        return 0;
      }
      if (a === UNASSIGNED_KEY) {
        return 1;
      }
      if (b === UNASSIGNED_KEY) {
        return -1;
      }
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    return sortedKeys.map((key) => {
      const entry = groups.get(key)!;
      entry.beads.sort(naturalSort);
      const collapsed = this.collapsedAssignees.get(key) === true;
      const label = entry.display || fallback;
      const dot = entry.dot || '⚪';
      const colorName = getAssigneeInfo(entry.beads[0] ?? { assignee: label } as any).colorName;
      return new AssigneeSectionItem(label, entry.beads, dot, colorName, collapsed, key);
    });
  }

  async refresh(): Promise<void> {
    if (this.refreshInProgress) {
      this.pendingRefresh = true;
      return;
    }

    this.refreshInProgress = true;
    try {
      const workspaceTargets = this.buildWorkspaceTargets();

      if (workspaceTargets.length === 0) {
        this.items = [];
        this.document = undefined;
        this.updateBadge();
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      await this.store.refresh(workspaceTargets);
    } catch (error) {
      console.error('Failed to refresh beads', error);
      void vscode.window.showErrorMessage(formatError(t('Unable to refresh beads list'), error));
    } finally {
      this.refreshInProgress = false;

      // If another refresh was requested while we were running, do it now
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh();
      }
    }
  }

  private buildWorkspaceTargets(): WorkspaceTarget[] {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const targets = this.activeWorkspaceFolder ? [this.activeWorkspaceFolder] : workspaceFolders;
    const workspaceTargets: WorkspaceTarget[] = [];
    this.primaryConfigForFavorites = undefined;

    for (const folder of targets) {
      const config = vscode.workspace.getConfiguration('beady', folder);
      const projectRoot = resolveProjectRoot(config, folder);
      if (!projectRoot) {
        continue;
      }

      if (!this.primaryConfigForFavorites) {
        this.primaryConfigForFavorites = config;
      }

      workspaceTargets.push(
        createWorkspaceTarget({
          workspaceId: folder.uri.toString(),
          projectRoot,
          config,
        })
      );
    }

    return workspaceTargets;
  }

  private async applyStoreSnapshot(snapshot: BeadsStoreSnapshot): Promise<void> {
    this.items = snapshot.items;
    this.document = snapshot.workspaces[0]?.document;

    const favoritesConfig = this.primaryConfigForFavorites ?? vscode.workspace.getConfiguration('beady');
    const favoritesEnabled = favoritesConfig.get<boolean>('favorites.enabled', false);
    if (favoritesEnabled && this.items.length > 0) {
      const favoriteLabel = getFavoriteLabel(favoritesConfig);
      const useLabelStorage = favoritesConfig.get<boolean>('favorites.useLabelStorage', true);
      await syncFavoritesState({
        context: this.context,
        items: this.items,
        favoriteLabel,
        useLabelStorage,
      });
    }

    this.updateBadge();
    this.onDidChangeTreeDataEmitter.fire();
    this.refreshOpenPanels();
  }

  registerPanel(beadId: string, panel: vscode.WebviewPanel): void {
    this.openPanels.set(beadId, panel);

    // Cache current hash so we only refresh when the underlying data changes.
    const item = this.items.find((i) => i.id === beadId);
    if (item) {
      this.panelHashes.set(beadId, this.computePanelHash(item));
    }

    panel.onDidDispose(() => {
      this.openPanels.delete(beadId);
      this.panelHashes.delete(beadId);
    });
  }

  private refreshOpenPanels(): void {
    const statusLabels = getStatusLabels();
    const beadStrings = buildBeadDetailStrings(statusLabels);
    const locale = vscode.env.language || 'en';
    this.openPanels.forEach((panel, beadId) => {
      const updatedItem = this.items.find((i: BeadItemData) => i.id === beadId);
      if (!updatedItem) {
        return;
      }

      const newHash = this.computePanelHash(updatedItem);
      const lastHash = this.panelHashes.get(beadId);
      if (newHash === lastHash) {
        return; // Skip expensive rerender when nothing changed.
      }

      const nonce = createNonce();
      panel.webview.html = getBeadDetailHtml(updatedItem, this.items, panel.webview, nonce, beadStrings, locale);
      this.panelHashes.set(beadId, newHash);
    });
  }

  private computePanelHash(item: BeadItemData): string {
    const raw = (item.raw as any) || {};
    const outgoingDeps = Array.isArray(raw.dependencies)
      ? raw.dependencies.map((dep: any) => ({
          id: dep?.depends_on_id || dep?.id || dep?.issue_id,
          type: dep?.dep_type || dep?.type || 'related',
        }))
      : [];

    const normalizedOutgoing = outgoingDeps
      .filter((d: { id?: string }) => d.id)
      .sort((a: { id: string; type: string }, b: { id: string; type: string }) =>
        a.id.localeCompare(b.id) || a.type.localeCompare(b.type)
      );

    // Collect incoming deps that target this item.
    const incomingDeps: { from: string; type: string }[] = [];
    this.items.forEach((other) => {
      if (other.id === item.id) {
        return;
      }

      const otherDeps = (other.raw as any)?.dependencies;
      if (!Array.isArray(otherDeps)) {
        return;
      }

      otherDeps.forEach((dep: any) => {
        const targetId = dep?.depends_on_id || dep?.id || dep?.issue_id;
        if (targetId === item.id) {
          incomingDeps.push({ from: other.id, type: dep?.dep_type || dep?.type || 'related' });
        }
      });
    });

    const normalizedIncoming = incomingDeps.sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type));

    const normalizedLabels = Array.isArray(raw.labels)
      ? [...raw.labels].map(String).sort((a, b) => a.localeCompare(b))
      : raw.labels;

    // Only include fields that affect rendering/controls to keep hash stable.
    return JSON.stringify({
      id: item.id,
      title: item.title,
      status: item.status,
      assignee: item.assignee,
      updatedAt: item.updatedAt,
      issueType: item.issueType,
      parentId: item.parentId,
      childCount: item.childCount,
      inProgressSince: item.inProgressSince,
      externalReferenceId: item.externalReferenceId,
      externalReferenceDescription: item.externalReferenceDescription,
      outgoingDeps: normalizedOutgoing,
      incomingDeps: normalizedIncoming,
      description: raw.description,
      design: raw.design,
      acceptance: raw.acceptance_criteria,
      notes: raw.notes,
      priority: raw.priority,
      labels: normalizedLabels,
    });
  }

  private filterItems(items: BeadItemData[]): BeadItemData[] {
    let filtered = applyQuickFilter(items, this.quickFilter);

    if (!this.showClosed) {
      filtered = filtered.filter((item) => item.status !== 'closed');
    }

    if (!this.searchQuery) {
      return filtered;
    }

    const query = this.searchQuery.toLowerCase();
    filtered = filtered.filter((item) => {
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

    return filtered;
  }

  async search(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: t('Search beads by ID, title, description, labels, status, etc.'),
      placeHolder: t('Enter search query'),
      value: this.searchQuery,
    });

    if (query === undefined) {
      return;
    }

    this.searchQuery = query.trim();
    this.onDidChangeTreeDataEmitter.fire();

    if (this.searchQuery) {
      const count = this.filterItems(this.items).length;
      void vscode.window.showInformationMessage(t('Found {0} bead(s) matching "{1}"', count, this.searchQuery));
    }
  }

  async applyQuickFilterPreset(): Promise<void> {
    type QuickFilterPick = vscode.QuickPickItem & { preset?: QuickFilterPreset; key: string };

    const activeKey = this.getQuickFilterKey() ?? '';
    const items: QuickFilterPick[] = [
      {
        kind: vscode.QuickPickItemKind.Separator,
        label: t('Status filters'),
        key: 'separator-status'
      },
      {
        label: t('Open'),
        description: this.getQuickFilterDescription({ kind: 'status', value: 'open' }),
        detail: t('Hides In Progress, Blocked, and Closed items'),
        key: 'status:open',
        preset: { kind: 'status', value: 'open' },
        picked: activeKey === 'status:open'
      },
      {
        label: t('In Progress'),
        description: this.getQuickFilterDescription({ kind: 'status', value: 'in_progress' }),
        detail: t('Active work across issues and epics'),
        key: 'status:in_progress',
        preset: { kind: 'status', value: 'in_progress' },
        picked: activeKey === 'status:in_progress'
      },
      {
        label: t('Blocked'),
        description: this.getQuickFilterDescription({ kind: 'status', value: 'blocked' }),
        detail: t('Issues and epics with blocking dependencies'),
        key: 'status:blocked',
        preset: { kind: 'status', value: 'blocked' },
        picked: activeKey === 'status:blocked'
      },
      {
        label: t('Closed'),
        description: this.getQuickFilterDescription({ kind: 'status', value: 'closed' }),
        detail: t('Completed or archived work'),
        key: 'status:closed',
        preset: { kind: 'status', value: 'closed' },
        picked: activeKey === 'status:closed'
      },
      {
        kind: vscode.QuickPickItemKind.Separator,
        label: t('Signals & hygiene'),
        key: 'separator-signals'
      },
      {
        label: t('Stale in progress'),
        description: this.getQuickFilterDescription({ kind: 'stale' }),
        detail: t('Uses the beady.staleThresholdMinutes setting'),
        key: 'stale',
        preset: { kind: 'stale' },
        picked: activeKey === 'stale'
      },
      {
        label: t('Has labels'),
        description: this.getQuickFilterDescription({ kind: 'label' }),
        detail: t('Good for triage and tag hygiene'),
        key: 'label',
        preset: { kind: 'label' },
        picked: activeKey === 'label'
      },
      {
        kind: vscode.QuickPickItemKind.Separator,
        label: t('Reset'),
        key: 'separator-reset'
      },
      {
        label: t('Show everything'),
        description: this.getQuickFilterDescription(undefined),
        detail: t('Lists all issues and epics'),
        key: '',
        picked: activeKey === ''
      }
    ];

    const picker = vscode.window.createQuickPick<QuickFilterPick>();
    picker.items = items;
    picker.matchOnDetail = true;
    picker.matchOnDescription = true;
    picker.placeholder = t('Filter mode (current: {0})', this.getQuickFilterLabel(this.quickFilter));
    picker.title = t('Filter mode picker');
    const preselected = items.filter(item => item.picked);
    if (preselected.length) {
      picker.activeItems = preselected;
      picker.selectedItems = preselected;
    }

    const selection = await new Promise<QuickFilterPick | undefined>((resolve) => {
      let finished = false;
      const accept = picker.onDidAccept(() => {
        finished = true;
        resolve(picker.selectedItems[0]);
        picker.hide();
      });
      const hide = picker.onDidHide(() => {
        if (!finished) {
          resolve(undefined);
        }
        accept.dispose();
        hide.dispose();
      });
      picker.show();
    });

    picker.dispose();

    if (!selection) {
      return;
    }

    if (!selection.preset) {
      this.clearQuickFilter();
      return;
    }

    const next = toggleQuickFilter(this.quickFilter, selection.preset);
    this.setQuickFilter(next);

    const nextLabel = this.getQuickFilterLabel(next);
    void vscode.window.showInformationMessage(
      next ? t('Applied filter: {0}', nextLabel) : t('Quick filters cleared')
    );
  }


  clearSearch(): void {
    this.searchQuery = '';
    this.onDidChangeTreeDataEmitter.fire();
    void vscode.window.showInformationMessage(t('Search cleared'));
  }

  getVisibleBeads(): BeadItemData[] {
    return this.applySortOrder(this.filterItems(this.items));
  }

  async findTreeItemById(id: string): Promise<BeadTreeItem | undefined> {
    const traverse = async (elements: TreeItemType[]): Promise<BeadTreeItem | undefined> => {
      for (const element of elements) {
        if (element instanceof BeadTreeItem && element.bead.id === id) {
          return element;
        }
        const children = await this.getChildren(element);
        if (children && children.length > 0) {
          const found = await traverse(children);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };

    const roots = await this.getChildren();
    if (!roots || roots.length === 0) {
      return undefined;
    }
    return traverse(roots);
  }

  async updateExternalReference(item: BeadItemData, newValue: string | undefined): Promise<void> {
    if (!this.document) {
      void vscode.window.showErrorMessage(t('Beads data is not loaded yet. Try refreshing the explorer.'));
      return;
    }

    if (!item.raw || typeof item.raw !== 'object') {
      void vscode.window.showErrorMessage(t('Unable to update this bead entry because its data is not editable.'));
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
      void vscode.window.showErrorMessage(formatError(t('Failed to save beads data file'), error));
    }
  }

  async updateStatus(item: BeadItemData, newStatus: string): Promise<void> {
    const validation = validateStatusInput(newStatus);
    if (!validation.valid) {
      void vscode.window.showWarningMessage(validationMessage('status', validation.reason));
      return;
    }

    const normalizedStatus = validation.value as string;
    const transition = validateStatusChange(item.status, normalizedStatus);
    if (!transition.allowed) {
      void vscode.window.showWarningMessage(validationMessage('status', transition.reason));
      return;
    }

    const itemId = resolveBeadId(item);
    if (!itemId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const config = vscode.workspace.getConfiguration('beady');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    try {
      await runBdCommand(['update', itemId, '--status', normalizedStatus], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Updated status to: {0}', normalizedStatus));
    } catch (error) {
      const message = formatSafeError(t('Failed to update status'), error, [projectRoot]);
      console.error('Failed to update status', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async updateTitle(item: BeadItemData, newTitle: string): Promise<void> {
    const validation = validateTitleInput(newTitle);
    if (!validation.valid) {
      void vscode.window.showWarningMessage(validationMessage('title', validation.reason));
      return;
    }

    const safeTitle = validation.value as string;
    const itemId = resolveBeadId(item);
    if (!itemId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const config = vscode.workspace.getConfiguration('beady');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    try {
      await runBdCommand(['update', itemId, '--title', safeTitle], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Updated title to: {0}', safeTitle));
    } catch (error) {
      const message = formatSafeError(t('Failed to update title'), error, [projectRoot]);
      console.error('Failed to update title', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async updateAssignee(item: BeadItemData, assigneeInput: string): Promise<void> {
    const validation = validateAssigneeInput(assigneeInput);
    if (!validation.valid) {
      void vscode.window.showWarningMessage(validationMessage('assignee', validation.reason));
      return;
    }

    const safeAssignee = validation.value ?? '';
    const currentAssignee = sanitizeInlineText(deriveAssigneeName(item, ''));
    if (safeAssignee === currentAssignee) {
      return;
    }

    const itemId = resolveBeadId(item);
    if (!itemId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const config = vscode.workspace.getConfiguration('beady');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    try {
      await runBdCommand(['update', itemId, '--assignee', safeAssignee], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(
        safeAssignee ? t('Updated assignee to: {0}', safeAssignee) : t('Cleared assignee')
      );
    } catch (error) {
      const message = formatSafeError(t('Failed to update assignee'), error, [projectRoot]);
      console.error('Failed to update assignee', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async addLabel(item: BeadItemData, label: string): Promise<void> {
    const validation = validateLabelInput(label);
    if (!validation.valid) {
      void vscode.window.showWarningMessage(t('Label must be 1-{0} characters and contain only letters, numbers, spaces, and .,:@_-', 64));
      return;
    }

    const safeLabel = validation.value as string;
    const itemId = resolveBeadId(item);
    if (!itemId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const config = vscode.workspace.getConfiguration('beady');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    try {
      await runBdCommand(['label', 'add', itemId, safeLabel], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Added label: {0}', safeLabel));
    } catch (error) {
      const message = formatSafeError(t('Failed to add label'), error, [projectRoot]);
      console.error('Failed to add label', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async addDependency(item: BeadItemData, targetId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beady');
    const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
    if (!dependencyEditingEnabled) {
      void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
      return;
    }

    const projectRoot = resolveProjectRoot(config);
    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    const safeSourceId = sanitizeDependencyId(item.id);
    const safeTargetId = sanitizeDependencyId(targetId);
    if (!safeSourceId || !safeTargetId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const validationError = validateDependencyAdd(this.items, safeSourceId, safeTargetId);
    if (validationError) {
      void vscode.window.showWarningMessage(t(validationError));
      return;
    }

    try {
      await runBdCommand(['dep', 'add', safeSourceId, safeTargetId], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Added dependency: {0} → {1}', safeSourceId, safeTargetId));
    } catch (error) {
      const combined = collectCliErrorOutput(error);
      const missingTarget = /not\s+found|unknown\s+issue|does\s+not\s+exist/i.test(combined);
      if (missingTarget) {
        await this.refresh();
        void vscode.window.showWarningMessage(t('Target issue not found. Refresh beads and try again.'));
        return;
      }
      console.error('Failed to add dependency', error);
      void vscode.window.showErrorMessage(formatBdError(t('Failed to add dependency'), error, projectRoot));
    }
  }

  async removeDependency(sourceId: string, targetId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beady');
    const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
    if (!dependencyEditingEnabled) {
      void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
      return;
    }

    const projectRoot = resolveProjectRoot(config);
    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    const safeSourceId = sanitizeDependencyId(sourceId);
    const safeTargetId = sanitizeDependencyId(targetId);
    if (!safeSourceId || !safeTargetId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const removeLabel = t('Remove');
    const answer = await vscode.window.showWarningMessage(
      t('Remove dependency {0} → {1}?', safeSourceId, safeTargetId),
      { modal: true },
      removeLabel
    );

    if (answer !== removeLabel) {
      return;
    }

    try {
      await runBdCommand(['dep', 'remove', safeSourceId, safeTargetId], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Removed dependency: {0} → {1}', safeSourceId, safeTargetId));
    } catch (error: any) {
      const combined = collectCliErrorOutput(error);
      const alreadyRemoved = /not\s+found|does\s+not\s+exist|no\s+dependency/i.test(combined);
      if (alreadyRemoved) {
        await this.refresh();
        void vscode.window.showWarningMessage(t('Dependency already removed: {0} → {1}', safeSourceId, safeTargetId));
        return;
      }
      console.error('Failed to remove dependency', error);
      void vscode.window.showErrorMessage(formatBdError(t('Failed to remove dependency'), error, projectRoot));
    }
  }

  async removeLabel(item: BeadItemData, label: string): Promise<void> {
    const validation = validateLabelInput(label);
    if (!validation.valid) {
      void vscode.window.showWarningMessage(t('Label must be 1-{0} characters and contain only letters, numbers, spaces, and .,:@_-', 64));
      return;
    }

    const safeLabel = validation.value as string;
    const itemId = resolveBeadId(item);
    if (!itemId) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }

    const config = vscode.workspace.getConfiguration('beady');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
      return;
    }

    try {
      await runBdCommand(['label', 'remove', itemId, safeLabel], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Removed label: {0}', safeLabel));
    } catch (error) {
      const message = formatSafeError(t('Failed to remove label'), error, [projectRoot]);
      console.error('Failed to remove label', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  private createTreeItem(item: BeadItemData): BeadTreeItem {
    const isExpanded = this.expandedRows.has(item.id);
    const treeItem = new BeadTreeItem(item, isExpanded);
    treeItem.contextValue = 'bead';

    const statusLabel = formatStatusLabel(item.status || 'open');
    const assigneeName = sanitizeInlineText(deriveAssigneeName(item, t('Unassigned'))) || t('Unassigned');
    const expansionLabel = isExpanded ? t('Expanded') : t('Collapsed');
    treeItem.accessibilityInformation = {
      label: t('{0}. Assignee: {1}. Status: {2}. {3} row.', item.title || item.id, assigneeName, statusLabel, expansionLabel),
      role: 'treeitem'
    };

    treeItem.command = {
      command: 'beady.openBead',
      title: t('Open Bead'),
      arguments: [item],
    };

    return treeItem;
  }

  // Drag and drop implementation
  async handleDrag(source: readonly TreeItemType[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    // Only allow dragging BeadTreeItems, not StatusSectionItems
    const beadItems = source.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
    if (beadItems.length === 0) {
      return;
    }
    const items = beadItems.map(item => item.bead);
    dataTransfer.set('application/vnd.code.tree.beadyExplorer', new vscode.DataTransferItem(items));
  }

  async handleDrop(target: TreeItemType | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
    const transferItem = dataTransfer.get('application/vnd.code.tree.beadyExplorer');
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
    const saved = this.context.workspaceState.get<Record<string, number>>('beady.manualSortOrder');
    if (saved) {
      this.manualSortOrder = new Map(Object.entries(saved));
    }
  }

  private saveSortOrder(): void {
    const obj: Record<string, number> = {};
    this.manualSortOrder.forEach((index, id) => {
      obj[id] = index;
    });
    void this.context.workspaceState.update('beady.manualSortOrder', obj);
  }

  clearSortOrder(): void {
    this.manualSortOrder.clear();
    void this.context.workspaceState.update('beady.manualSortOrder', undefined);
    this.onDidChangeTreeDataEmitter.fire();
    void vscode.window.showInformationMessage(t('Manual sort order cleared'));
  }

  private loadSortMode(): void {
    const saved = this.context.workspaceState.get<'id' | 'status' | 'epic' | 'assignee'>('beady.sortMode');
    if (saved) {
      this.sortMode = saved;
    }
  }

  private saveSortMode(): void {
    void this.context.workspaceState.update('beady.sortMode', this.sortMode);
  }
  
  private loadCollapsedSections(): void {
    const savedSections = this.context.workspaceState.get<string[]>('beady.collapsedSections');
    if (savedSections !== undefined) {
      this.collapsedSections = new Set(savedSections.filter(key => !key.startsWith('epic-')));
      // Migration: legacy epic keys stored in collapsedSections (epic-<id>)
      savedSections.forEach(key => {
        if (key.startsWith('epic-')) {
          const epicId = key.replace('epic-', '');
          this.collapsedEpics.set(epicId, true);
        }
      });
    } else {
      this.collapsedSections = new Set(DEFAULT_COLLAPSED_SECTION_KEYS);
    }

    const savedEpics = this.context.workspaceState.get<Record<string, boolean>>('beady.collapsedEpics');
    if (savedEpics) {
      this.collapsedEpics = new Map(Object.entries(savedEpics));
    }
  }
  
  private saveCollapsedSections(): void {
    // Persist non-epic sections
    const sectionStates = Array.from(this.collapsedSections).filter(key => !key.startsWith('epic-'));
    void this.context.workspaceState.update('beady.collapsedSections', sectionStates);

    // Persist epic collapse states separately
    const epicState: Record<string, boolean> = {};
    this.collapsedEpics.forEach((collapsed, epicId) => {
      if (collapsed) {
        epicState[epicId] = true;
      }
    });
    void this.context.workspaceState.update('beady.collapsedEpics', epicState);
  }

  private loadCollapsedAssignees(): void {
    const saved = this.context.workspaceState.get<Record<string, boolean>>('beady.collapsedAssignees');
    const entries = saved ? Object.entries(saved) : [];
    this.collapsedAssignees = new Map(entries);
  }

  private saveCollapsedAssignees(): void {
    const state: Record<string, boolean> = {};
    this.collapsedAssignees.forEach((collapsed, key) => {
      if (collapsed) {
        state[key] = true;
      }
    });
    void this.context.workspaceState.update('beady.collapsedAssignees', state);
  }

  private loadExpandedRows(): void {
    const saved = this.context.workspaceState.get<string[]>('beady.expandedRows');
    this.expandedRows = new Set(saved ?? []);
  }

  private saveExpandedRows(): void {
    void this.context.workspaceState.update('beady.expandedRows', Array.from(this.expandedRows));
  }

  expandRow(element: TreeItemType | undefined): void {
    if (!this.treeView || !element || !(element instanceof BeadTreeItem)) {
      return;
    }

    const beadId = element.bead?.id;
    if (!beadId) {
      return;
    }

    if (!this.expandedRows.has(beadId)) {
      this.expandedRows.add(beadId);
      this.saveExpandedRows();
    }

    void this.treeView.reveal(element, { expand: true, focus: false, select: false });
  }

  private loadQuickFilter(): void {
    const saved = this.context.workspaceState.get<QuickFilterPreset>('beady.quickFilterPreset');
    this.quickFilter = normalizeQuickFilter(saved);
    if (saved && !this.quickFilter) {
      void vscode.window.showWarningMessage(t('Ignoring invalid quick filter; showing all items.'));
    }
    this.syncQuickFilterContext();
  }

  private loadClosedVisibility(): void {
    const saved = this.context.workspaceState.get<boolean>('beady.showClosed');
    this.showClosed = saved !== undefined ? saved : true;
    this.syncClosedVisibilityContext();
  }

  private getQuickFilterLabel(preset?: QuickFilterPreset): string {
    if (!preset) {
      return t('All items');
    }

    if (preset.kind === 'status') {
      switch (preset.value) {
        case 'in_progress':
          return t('In Progress');
        case 'blocked':
          return t('Blocked');
        case 'closed':
          return t('Closed');
        default:
          return t('Open');
      }
    }

    if (preset.kind === 'label') {
      return t('Has labels');
    }

    if (preset.kind === 'stale') {
      return t('Stale in progress');
    }

    return t('All items');
  }

  private getQuickFilterDescription(preset?: QuickFilterPreset): string {
    if (!preset) {
      return t('Showing issues and epics without additional filtering');
    }

    if (preset.kind === 'status') {
      switch (preset.value) {
        case 'in_progress':
          return t('Only issues and epics that are currently in progress');
        case 'blocked':
          return t('Only items whose status is Blocked');
        case 'closed':
          return t('Closed or completed items');
        default:
          return t('Open items (issues and epics)');
      }
    }

    if (preset.kind === 'label') {
      return t('Items that have one or more labels');
    }

    if (preset.kind === 'stale') {
      return t('In-progress items past the stale threshold');
    }

    return t('Showing issues and epics without additional filtering');
  }

  syncQuickFilterContext(): void {
    this.updateQuickFilterUi();
  }

  private syncClosedVisibilityContext(): void {
    void vscode.commands.executeCommand('setContext', 'beady.showClosed', this.showClosed);
    void vscode.commands.executeCommand('setContext', 'beady.closedHidden', !this.showClosed);
    this.updateViewDescription();
  }

  private updateQuickFilterUi(): void {
    const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
    const key = quickFiltersEnabled ? this.getQuickFilterKey() ?? '' : '';
    const label = quickFiltersEnabled ? this.getQuickFilterLabel(this.quickFilter) : '';
    void vscode.commands.executeCommand('setContext', 'beady.activeQuickFilter', key);
    void vscode.commands.executeCommand('setContext', 'beady.activeQuickFilterLabel', label);
    void vscode.commands.executeCommand('setContext', 'beady.quickFilterActive', !!key);
    this.updateViewDescription();
  }

  private updateViewDescription(): void {
    if (!this.treeView) {
      return;
    }

    const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
    const parts: string[] = [];

    parts.push(t('Sort: {0}', this.getSortModeLabel()));

    if (quickFiltersEnabled) {
      const label = this.getQuickFilterLabel(this.quickFilter);
      parts.push(t('Filter: {0}', label || t('All items')));
    }

    parts.push(this.showClosed ? t('Closed visible') : t('Closed hidden'));

    this.treeView.description = parts.length > 0 ? parts.join(' · ') : undefined;
  }

  private getQuickFilterKey(): string | undefined {
    if (!this.quickFilter) {
      return undefined;
    }
    const value = 'value' in this.quickFilter && this.quickFilter.value ? `:${this.quickFilter.value}` : '';
    return `${this.quickFilter.kind}${value}`;
  }

  setQuickFilter(preset: QuickFilterPreset | undefined): void {
    const normalized = normalizeQuickFilter(preset);
    if (preset && !normalized) {
      void vscode.window.showWarningMessage(t('Invalid quick filter selection; showing all items.'));
    }
    this.quickFilter = normalized;
    void this.context.workspaceState.update('beady.quickFilterPreset', normalized);
    this.updateQuickFilterUi();
    this.onDidChangeTreeDataEmitter.fire();
  }

  clearQuickFilter(): void {
    this.setQuickFilter(undefined);
    void vscode.window.showInformationMessage(t('Quick filters cleared'));
  }

  getQuickFilter(): QuickFilterPreset | undefined {
    return this.quickFilter;
  }

  getClosedVisibility(): boolean {
    return this.showClosed;
  }

  toggleClosedVisibility(): void {
    this.showClosed = !this.showClosed;
    void this.context.workspaceState.update('beady.showClosed', this.showClosed);
    this.syncClosedVisibilityContext();
    this.updateBadge();
    this.onDidChangeTreeDataEmitter.fire();
  }


  getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  private applyWorkspaceSelection(selectionId?: string): void {
    const workspaces = vscode.workspace.workspaceFolders ?? [];
    const folder = findWorkspaceById(selectionId, workspaces);
    if (folder) {
      this.activeWorkspaceId = folder.uri.toString();
      this.activeWorkspaceFolder = folder;
    } else {
      this.activeWorkspaceId = 'all';
      this.activeWorkspaceFolder = undefined;
    }
    const label = this.activeWorkspaceFolder?.name ?? t('All Workspaces');
    void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', label);
  }

  private restoreWorkspaceSelection(): void {
    const saved = loadSavedWorkspaceSelection(this.context);
    this.applyWorkspaceSelection(saved);
  }

  async setActiveWorkspace(selectionId: string): Promise<void> {
    this.applyWorkspaceSelection(selectionId);
    await saveWorkspaceSelection(this.context, this.activeWorkspaceId);
    void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', this.activeWorkspaceFolder?.name ?? t('All Workspaces'));
    await this.refresh();
  }

  handleWorkspaceFoldersChanged(): void {
    this.applyWorkspaceSelection(this.activeWorkspaceId);
    void this.refresh();
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
    if (element instanceof EpicStatusSectionItem) {
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
    if (element instanceof BeadTreeItem) {
      const beadId = element.bead?.id;
      if (beadId) {
        if (isCollapsed) {
          this.expandedRows.delete(beadId);
        } else {
          this.expandedRows.add(beadId);
        }
        this.saveExpandedRows();
      }
      return;
    }

    if (element instanceof EpicTreeItem && element.epic) {
      this.collapsedEpics.set(element.epic.id, isCollapsed);
      this.saveCollapsedSections();
      element.updateIcon(isCollapsed);
      element.collapsibleState = isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
      this.onDidChangeTreeDataEmitter.fire(element);
      return;
    }

    if (element instanceof AssigneeSectionItem) {
      this.collapsedAssignees.set(element.key, isCollapsed);
      this.saveCollapsedAssignees();
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
    const modes = this.sortPickerEnabled ? ['id', 'status', 'epic', 'assignee'] as const : ['id', 'status', 'epic'] as const;
    const currentIndex = modes.indexOf(this.sortMode as any);
    const next = modes[(currentIndex + 1) % modes.length];
    this.setSortMode(next as any, { showToast: true });
  }

  getSortMode(): 'id' | 'status' | 'epic' | 'assignee' {
    return this.sortMode;
  }

  private getSortModeLabel(): string {
    switch (this.sortMode) {
      case 'status':
        return t('Status (grouped)');
      case 'epic':
        return t('Epic (grouped)');
      case 'assignee':
        return t('Assignee (grouped by owner, Unassigned last)');
      default:
        return t('ID (natural)');
    }
  }

  private setSortMode(mode: 'id' | 'status' | 'epic' | 'assignee', options: { showToast?: boolean } = {}): void {
    // Guard: when the rollout flag is off, do not allow assignee mode
    if (!this.sortPickerEnabled && mode === 'assignee') {
      mode = 'id';
    }
    if (this.sortMode === mode) {
      return;
    }
    this.sortMode = mode;
    this.saveSortMode();
    this.onDidChangeTreeDataEmitter.fire();
    this.updateSortDescription();
    if (options.showToast) {
      void vscode.window.showInformationMessage(t('Sort mode set to {0}.', this.getSortModeLabel()));
    }
  }

  setSortPickerEnabled(enabled: boolean): void {
    this.sortPickerEnabled = enabled;
    if (!enabled && this.sortMode === 'assignee') {
      this.setSortMode('id');
    }
  }

  async pickSortMode(): Promise<void> {
    const modes: Array<{ mode: 'id' | 'status' | 'epic' | 'assignee'; label: string; description: string }>
      = [
        { mode: 'id', label: t('ID (natural)'), description: t('Sort by issue id (default)') },
        { mode: 'status', label: t('Status (grouped)'), description: t('Group by status, sort by id within each group') },
        { mode: 'epic', label: t('Epic (grouped)'), description: t('Group by parent epic, open/blocked first') },
      ];

    if (this.sortPickerEnabled) {
      modes.push({ mode: 'assignee', label: t('Assignee (grouped)'), description: t('Group by assignee, unassigned last') });
    }

    const picks = modes.map((entry) => ({
      label: entry.label,
      description: entry.description,
      picked: this.sortMode === entry.mode,
      mode: entry.mode,
    }));

    const selection = await vscode.window.showQuickPick(picks, {
      placeHolder: t('Select sort mode for Beads explorer'),
      matchOnDescription: true,
    });

    if (!selection) {
      return;
    }

    this.setSortMode(selection.mode, { showToast: true });
  }

  private updateSortDescription(): void {
    if (!this.treeView) {
      return;
    }
    this.treeView.description = t('Sort: {0}', this.getSortModeLabel());
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

    if (this.sortMode === 'assignee') {
      return this.sortByAssignee(items);
    }

    if (this.sortMode === 'epic') {
      return this.sortByEpic(items);
    }

    // Default: return items as-is (already naturally sorted by ID)
    return items;
  }

  private sortByEpic(items: BeadItemData[]): BeadItemData[] {
    const getEpicId = (item: BeadItemData): string => {
      const raw = item.raw as any;
      const parentDep = raw?.dependencies?.find((d: any) => d.type === 'parent-child' || d.dep_type === 'parent-child');
      return parentDep?.id || parentDep?.depends_on_id || parentDep?.issue_id || '';
    };

    return [...items].sort((a, b) => {
      const epicA = getEpicId(a);
      const epicB = getEpicId(b);
      if (epicA && !epicB) { return -1; }
      if (!epicA && epicB) { return 1; }
      if (epicA !== epicB) { return epicA.localeCompare(epicB); }
      return naturalSort(a, b);
    });
  }

  private sortByStatus(items: BeadItemData[]): BeadItemData[] {
    return [...items].sort((a, b) => {
      const statusA = a.status || 'open';
      const statusB = b.status || 'open';

      // First sort by status priority
      const statusCompare = compareStatus(statusA, statusB);
      if (statusCompare !== 0) {
        return statusCompare;
      }

      // Then sort by ID naturally within each status group
      return naturalSort(a, b);
    });
  }

  private sortByAssignee(items: BeadItemData[]): BeadItemData[] {
    const normalize = (item: BeadItemData) => deriveAssigneeName(item, '').trim();
    return [...items].sort((a, b) => {
      const aKey = normalize(a);
      const bKey = normalize(b);

      const aHas = aKey.length > 0;
      const bHas = bKey.length > 0;

      if (aHas && !bHas) {
        return -1;
      }
      if (!aHas && bHas) {
        return 1;
      }

      const cmp = aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
      if (cmp !== 0) {
        return cmp;
      }

      return naturalSort(a, b);
    });
  }
}

function getBeadDetailHtml(
  item: BeadItemData,
  allItems: BeadItemData[] | undefined,
  webview: vscode.Webview,
  nonce: string,
  strings: BeadDetailStrings,
  locale: string
): string {
  const raw = item.raw as any;
  const description = raw?.description || '';
  const design = raw?.design || '';
  const acceptanceCriteria = raw?.acceptance_criteria || '';
  const notes = raw?.notes || '';
  const issueType = raw?.issue_type || '';
  const priority = raw?.priority || '';
  const createdAt = raw?.created_at ? new Date(raw.created_at).toLocaleString(locale) : '';
  const updatedAt = raw?.updated_at ? new Date(raw.updated_at).toLocaleString(locale) : '';
  const closedAt = raw?.closed_at ? new Date(raw.closed_at).toLocaleString(locale) : '';
  const dependencies = raw?.dependencies || [];
  const assigneeRaw = deriveAssigneeName(item, strings.assigneeFallback);
  const assignee = sanitizeInlineText(assigneeRaw) || strings.assigneeFallback;
  const labels = raw?.labels || [];
  const dependencyEditingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);

  // Build dependency trees for visualization
  const treeData = allItems && allItems.length > 0 ? buildDependencyTrees(allItems, item.id) : { upstream: [], downstream: [] };
  const hasUpstream = treeData.upstream.length > 0;
  const hasDownstream = treeData.downstream.length > 0;
  const hasAnyDeps = hasUpstream || hasDownstream;

  const statusColors: Record<string, string> = {
    open: '#3794ff',
    in_progress: '#f9c513',
    blocked: '#f14c4c',
    closed: '#73c991',
  };

  const getStatusLabel = (status?: string): string => {
    if (!status) {
      return '';
    }
    const key = status as keyof StatusLabelMap;
    return strings.statusLabels[key] ?? status;
  };



  const renderBranch = (
    nodes: any[],
    parentId: string,
    direction: 'upstream' | 'downstream',
    depth: number
  ): string => {
    return nodes
      .map((node: any) => {
        const removeSourceId = direction === 'upstream' ? parentId : node.id;
        const removeTargetId = direction === 'upstream' ? node.id : parentId;
        const children = node.children && node.children.length > 0 ? renderBranch(node.children, node.id, direction, depth + 1) : '';
        const color = statusColors[node.status || 'open'] || statusColors.open;
        const statusLabel = getStatusLabel(node.status) || strings.statusLabels.open;
        const safeType = escapeHtml(node.type);
        const ariaLabelParts = [
          `${escapeHtml(node.id)}`,
          node.title ? escapeHtml(node.title) : '',
          statusLabel ? t('Status {0}', statusLabel) : '',
          direction === 'upstream' ? strings.dependencyTreeUpstream : strings.dependencyTreeDownstream,
          safeType ? t('Type {0}', safeType) : ''
        ].filter(Boolean);
        return `
          <div class="tree-row" role="treeitem" aria-level="${depth + 1}" aria-expanded="${children ? 'true' : 'false'}" tabindex="-1" data-issue-id="${escapeHtml(node.id)}" data-parent-id="${escapeHtml(parentId)}" data-direction="${direction}" style="--depth:${depth}" aria-label="${ariaLabelParts.join(' • ')}" title="${escapeHtml(node.title || '')}">
            <div class="tree-row-main">
              <div class="tree-left">
                <span class="status-dot" aria-hidden="true" style="background-color:${color};"></span>
                <span class="status-label">${escapeHtml(statusLabel)}</span>
                <span class="tree-id" style="cursor: pointer; text-decoration: underline;" onclick="openBead('${escapeHtml(node.id)}')">${escapeHtml(node.id)}</span>
                <span class="tree-title">${escapeHtml(node.title || '')}</span>
                <span class="dep-type dep-${safeType}">${safeType}</span>
                ${node.missing ? `<span class="missing-pill">${escapeHtml(strings.missingDependencyLabel)}</span>` : ''}
              </div>
              ${
                dependencyEditingEnabled && !node.missing
                  ? `<button class="dependency-remove" aria-label="${escapeHtml(strings.removeDependencyLabel)} ${escapeHtml(removeSourceId)} → ${escapeHtml(removeTargetId)}" data-source-id="${escapeHtml(removeSourceId)}" data-target-id="${escapeHtml(removeTargetId)}">${escapeHtml(strings.removeDependencyLabel)}</button>`
                  : ''
              }
            </div>
            ${children ? `<div class="tree-children" role="group">${children}</div>` : ''}
          </div>
        `;
      })
      .join('');
  };

  const renderBranchSection = (direction: 'upstream' | 'downstream', nodes: any[], label: string): string => {
    if (!nodes || nodes.length === 0) {
      return '';
    }
    return `
      <div class="tree-branch" data-direction="${direction}" role="group" aria-label="${escapeHtml(label)}">
        <div class="tree-direction-label">${escapeHtml(label)}</div>
        <div class="tree-branch-nodes">
          ${renderBranch(nodes, item.id, direction, 0)}
        </div>
      </div>
    `;
  };

  const dependencyTreeHtml = `
    <div class="section dependency-tree-section">
      <div class="section-title tree-title-row">
        <span>${escapeHtml(strings.dependencyTreeTitle)}</span>
        ${
          dependencyEditingEnabled
            ? `<div class="tree-actions">
                <button class="edit-button" id="addUpstreamButton">${escapeHtml(strings.addUpstreamLabel)}</button>
                <button class="edit-button" id="addDownstreamButton">${escapeHtml(strings.addDownstreamLabel)}</button>
              </div>`
            : ''
        }
      </div>
      <div class="dependency-tree-container" role="tree" aria-label="Dependencies for ${escapeHtml(item.id)}">
        ${renderBranchSection('upstream', treeData.upstream, strings.dependencyTreeUpstream)}
        ${renderBranchSection('downstream', treeData.downstream, strings.dependencyTreeDownstream)}
        ${hasAnyDeps ? '' : `<div class="empty">${escapeHtml(strings.dependencyEmptyLabel)}</div>`}
      </div>
    </div>
  `;

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

  const priorityLabel = formatPriorityLabel(priority);

  const statusDisplay = getStatusLabel(item.status) || strings.statusLabels.open;

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src 'nonce-${nonce}' ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    "connect-src 'none'",
    "frame-src 'none'"
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.id}</title>
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <style nonce="${nonce}">
        :root {
            --spacing-unit: 16px;
            --font-size-title: 24px;
            --font-size-meta: 13px;
            --header-padding: 20px;
        }
        body.compact {
            --spacing-unit: 8px;
            --font-size-title: 18px;
            --font-size-meta: 11px;
            --header-padding: 12px;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            line-height: 1.5;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: var(--header-padding);
            flex: 1;
            overflow-y: auto;
            width: 100%;
            box-sizing: border-box;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: var(--spacing-unit);
            margin-bottom: var(--spacing-unit);
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .id-badge {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 4px;
            cursor: pointer;
        }
        .actions {
            display: flex;
            gap: 8px;
        }
        .icon-button {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .delete-button {
            color: var(--vscode-errorForeground) !important;
        }
        .title {
            font-size: var(--font-size-title);
            font-weight: 600;
            margin: 0 0 8px 0;
            line-height: 1.2;
            border: 1px solid transparent;
            border-radius: 4px;
            padding: 2px 4px;
            margin-left: -5px;
        }
        .title[contenteditable="true"] {
            background-color: var(--vscode-input-background);
            border-color: var(--vscode-input-border);
            outline: none;
        }
        .title[contenteditable="true"]:focus {
            border-color: var(--vscode-focusBorder);
        }
        .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 8px 16px;
            font-size: var(--font-size-meta);
            color: var(--vscode-descriptionForeground);
        }
        .meta-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .meta-label {
            font-weight: 500;
            opacity: 0.8;
        }
        .meta-value {
            color: var(--vscode-foreground);
        }
        .section {
            margin-bottom: var(--spacing-unit);
        }
        .section-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .description {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 12px;
            border-radius: 2px;
        }
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .tag-remove {
            cursor: pointer;
            font-weight: bold;
            opacity: 0.7;
        }
        .tag-remove:hover {
            opacity: 1;
            color: var(--vscode-errorForeground);
        }
        /* Dependency Tree Styles */
        .tree-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .tree-branch {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tree-branch:last-child {
            border-bottom: none;
        }
        .tree-direction-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .tree-branch-nodes {
            margin-left: 4px;
        }
        .tree-row {
            padding: 2px 0;
        }
        .tree-row-main {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tree-left {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .tree-id {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-textLink-foreground);
            font-weight: 500;
        }
        .dep-type {
            font-size: 10px;
            padding: 1px 4px;
            border-radius: 4px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            opacity: 0.8;
        }
        .empty {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 8px;
        }
        .external-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .external-link:hover {
            text-decoration: underline;
        }
        /* Status Dropdown */
        .status-wrapper {
            position: relative;
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
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        .status-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .status-badge {
            cursor: pointer;
        }
        .status-badge:hover {
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-top">
                <div class="header-left">
                    <div class="id-badge" title="Copy ID" onclick="copyToClipboard('${item.id}')">${item.id}</div>
                    <div class="status-wrapper">
                        <div class="status-badge" id="statusBadge" style="color: ${statusColor}; border: 1px solid ${statusColor}44; background-color: ${statusColor}11; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;" data-status="${item.status || 'open'}">
                            ${statusDisplay} ▾
                        </div>
                        <div class="status-dropdown" id="statusDropdown">
                            <div class="status-option" data-status="open">${strings.statusLabels.open}</div>
                            <div class="status-option" data-status="in_progress">${strings.statusLabels.in_progress}</div>
                            <div class="status-option" data-status="blocked">${strings.statusLabels.blocked}</div>
                            <div class="status-option" data-status="closed">${strings.statusLabels.closed}</div>
                        </div>
                    </div>
                    ${issueType ? `<span class="tag" style="background-color: var(--vscode-badge-background);">${issueType.toUpperCase()}</span>` : ''}
                </div>
                <div class="actions">
                    <button id="toggle-compact" class="icon-button" title="${t('Toggle density')}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v2H1V3zm0 4h14v2H1V7zm0 4h14v2H1v-2z"/></svg>
                    </button>
                    <button class="icon-button" id="editButton" title="${strings.editLabel}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l.66-1.17L5.23 14l-1.17.66-.66-1.17zM14 4.23l-7.53 7.53-2.23-2.23L11.77 2h1.46v2.23z"/></svg>
                    </button>
                    <button class="icon-button delete-button" id="deleteButton" title="${strings.deleteLabel}" style="display: none;">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 2H9.5V3H14V4H2V3H6.5V2ZM3 5H13V14C13 14.55 12.55 15 12 15H4C3.45 15 3 14.55 3 14V5ZM5 7V13H6V7H5ZM8 7V13H9V7H8ZM11 7V13H12V7H11Z"/></svg>
                    </button>
                </div>
            </div>
            <h1 class="title" id="issueTitle" contenteditable="false">${escapeHtml(item.title)}</h1>
            <div class="meta-grid">
                <div class="meta-item">
                    <span class="meta-label">${strings.assigneeLabel}</span>
                    <span class="meta-value" id="assignee-edit" style="cursor: pointer; border-bottom: 1px dashed var(--vscode-descriptionForeground);">${escapeHtml(assignee)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">${strings.createdLabel}</span>
                    <span class="meta-value">${createdAt}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">${strings.updatedLabel}</span>
                    <span class="meta-value">${updatedAt}</span>
                </div>
                ${item.externalReferenceId ? `
                <div class="meta-item">
                    <span class="meta-label">${strings.externalRefLabel}</span>
                    <span class="meta-value external-link" onclick="openExternal('${item.externalReferenceId}')">${escapeHtml(item.externalReferenceId)}</span>
                </div>` : ''}
            </div>
        </div>

        <div class="section">
            <div class="section-title">${strings.descriptionLabel}</div>
            <div class="description">${linkifyText(description) || '<span class="empty">No description</span>'}</div>
        </div>

        ${design ? `
        <div class="section">
            <div class="section-title">${strings.designLabel}</div>
            <div class="description">${linkifyText(design)}</div>
        </div>` : ''}

        ${acceptanceCriteria ? `
        <div class="section">
            <div class="section-title">${strings.acceptanceLabel}</div>
            <div class="description">${linkifyText(acceptanceCriteria)}</div>
        </div>` : ''}

        ${notes ? `
        <div class="section">
            <div class="section-title">${strings.notesLabel}</div>
            <div class="description">${linkifyText(notes)}</div>
        </div>` : ''}

        <div class="section">
            <div class="section-title">${strings.labelsLabel}</div>
            <div class="tags" id="labelsContainer">
                ${labels.map((l: string) => `<span class="tag" data-label="${escapeHtml(l)}">${escapeHtml(l)}<span class="tag-remove" style="display: none;" onclick="removeLabel('${escapeHtml(l)}')">×</span></span>`).join('')}
                <button class="icon-button" id="addLabelButton" title="${strings.addLabelLabel}" style="display: none;">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg>
                </button>
            </div>
        </div>

        <div class="section">
            <div class="section-title">${strings.dependencyTreeTitle}</div>
            <div class="tree-container">
                ${renderBranchSection('upstream', treeData.upstream, strings.dependencyTreeUpstream)}
                ${renderBranchSection('downstream', treeData.downstream, strings.dependencyTreeDownstream)}
                ${!hasAnyDeps ? `<div class="empty">${strings.dependencyEmptyLabel}</div>` : ''}
            </div>
            ${dependencyEditingEnabled ? `
            <div class="tree-actions" style="margin-top: 8px; display: none;" id="treeActions">
                <button class="icon-button" id="addUpstreamButton" title="${strings.addUpstreamLabel}">+ Upstream</button>
                <button class="icon-button" id="addDownstreamButton" title="${strings.addDownstreamLabel}">+ Downstream</button>
            </div>` : ''}
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || { compact: false };
        
        if (state.compact) {
            document.body.classList.add('compact');
        }

        document.getElementById('toggle-compact').addEventListener('click', () => {
            document.body.classList.toggle('compact');
            const isCompact = document.body.classList.contains('compact');
            vscode.setState({ ...state, compact: isCompact });
        });

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
        }

        function openExternal(url) {
            vscode.postMessage({ command: 'openExternal', url });
        }

        function openBead(beadId) {
            vscode.postMessage({ command: 'openBead', beadId });
        }

        function removeLabel(label) {
            vscode.postMessage({ command: 'removeLabel', label, issueId: '${item.id}' });
        }

        let isEditMode = false;
        const editButton = document.getElementById('editButton');
        const deleteButton = document.getElementById('deleteButton');
        const issueTitle = document.getElementById('issueTitle');
        const addLabelButton = document.getElementById('addLabelButton');
        const treeActions = document.getElementById('treeActions');
        const statusBadge = document.getElementById('statusBadge');
        const statusDropdown = document.getElementById('statusDropdown');

        editButton.addEventListener('click', () => {
            isEditMode = !isEditMode;
            if (isEditMode) {
                editButton.style.color = 'var(--vscode-textLink-foreground)';
                deleteButton.style.display = 'flex';
                issueTitle.contentEditable = 'true';
                addLabelButton.style.display = 'inline-flex';
                if (treeActions) treeActions.style.display = 'flex';
                document.querySelectorAll('.tag-remove').forEach(el => el.style.display = 'inline');
            } else {
                editButton.style.color = '';
                deleteButton.style.display = 'none';
                issueTitle.contentEditable = 'false';
                addLabelButton.style.display = 'none';
                if (treeActions) treeActions.style.display = 'none';
                document.querySelectorAll('.tag-remove').forEach(el => el.style.display = 'none');
                
                // Save title
                const newTitle = issueTitle.innerText;
                if (newTitle !== '${escapeHtml(item.title)}') {
                    vscode.postMessage({ command: 'updateTitle', title: newTitle, issueId: '${item.id}' });
                }
            }
        });

        deleteButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'deleteBead', beadId: '${item.id}' });
        });

        document.getElementById('assignee-edit').addEventListener('click', () => {
            vscode.postMessage({ command: 'editAssignee', id: '${item.id}' });
        });

        addLabelButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'addLabel', issueId: '${item.id}' });
        });

        if (document.getElementById('addUpstreamButton')) {
            document.getElementById('addUpstreamButton').addEventListener('click', () => {
                vscode.postMessage({ command: 'addDependency', type: 'upstream', issueId: '${item.id}' });
            });
        }

        if (document.getElementById('addDownstreamButton')) {
            document.getElementById('addDownstreamButton').addEventListener('click', () => {
                vscode.postMessage({ command: 'addDependency', type: 'downstream', issueId: '${item.id}' });
            });
        }

        // Status Dropdown Logic
        statusBadge.addEventListener('click', () => {
            if (isEditMode) {
                statusDropdown.classList.toggle('show');
            }
        });

        document.querySelectorAll('.status-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const newStatus = opt.getAttribute('data-status');
                vscode.postMessage({ command: 'updateStatus', status: newStatus, issueId: '${item.id}' });
                statusDropdown.classList.remove('show');
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!statusBadge.contains(e.target) && !statusDropdown.contains(e.target)) {
                statusDropdown.classList.remove('show');
            }
        });
    </script>
</body>
</html>`;
}

function getDependencyTreeHtml(items: BeadItemData[], strings: DependencyTreeStrings, locale: string, dependencyEditingEnabled: boolean): string {
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
    const safeId = sanitizeDependencyId(item.id);
    if (!safeId) {
      console.warn('[getDependencyTreeHtml DEBUG] Skipping item with invalid id', item?.id);
      return;
    }

    const safeItem = safeId === item.id ? item : { ...item, id: safeId };
    nodeMap.set(safeId, safeItem);
    const raw = item.raw as any;
    const dependencies = raw?.dependencies || [];

    // DEBUG: Log dependency info for first few items
    if (idx < 3) {
      console.log(`[getDependencyTreeHtml DEBUG] Item ${idx} (${safeId}):`, {
        title: item.title,
        status: item.status,
        hasDependencies: dependencies.length > 0,
        dependenciesCount: dependencies.length,
        dependencies: dependencies
      });
    }

    dependencies.forEach((dep: any) => {
      const depType = dep.dep_type || dep.type || 'related';
      const targetId = sanitizeDependencyId(dep.id || dep.depends_on_id || dep.issue_id);
      if (targetId) {
        edges.push({
          from: safeId,
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

  const serializeForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\u003c').replace(/>/g, '\u003e');
  const nodesJson = serializeForScript(sortedNodes);
  const edgesJson = serializeForScript(edges);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(strings.title)}</title>
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
            pointer-events: auto;
            z-index: 0;
        }

        .edge {
            stroke: var(--vscode-panel-border);
            stroke-width: 2;
            fill: none;
            marker-end: url(#arrowhead);
            opacity: 0.8;
            cursor: pointer;
        }

        .edge.blocks {
            stroke: #f14c4c;
            stroke-width: 2.5;
        }

        .edge.selected {
            stroke: var(--vscode-focusBorder, #007acc);
            stroke-width: 3;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 8px;
            align-items: center;
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

        .hint-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
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
        <button class="control-button" onclick="resetZoom()">${escapeHtml(strings.resetView)}</button>
        <button class="control-button" onclick="autoLayout()">${escapeHtml(strings.autoLayout)}</button>
        ${dependencyEditingEnabled ? `<button class="control-button" id="removeEdgeButton">${escapeHtml(strings.removeDependencyLabel)}</button>` : ''}
        ${dependencyEditingEnabled ? `<span class="hint-text" id="linkHint">Shift+Click a node to add a dependency</span>` : ''}
    </div>

    <div class="legend">
        <div class="legend-item">
            <span class="status-indicator closed"></span>
            <span>${escapeHtml(strings.legendClosed)}</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator in_progress"></span>
            <span>${escapeHtml(strings.legendInProgress)}</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator open"></span>
            <span>${escapeHtml(strings.legendOpen)}</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator blocked"></span>
            <span>${escapeHtml(strings.legendBlocked)}</span>
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
        const dependencyEditingEnabled = ${dependencyEditingEnabled ? 'true' : 'false'};
        const localized = ${JSON.stringify({
          emptyTitle: strings.emptyTitle,
          emptyDescription: strings.emptyDescription,
          renderErrorTitle: strings.renderErrorTitle,
        })};

        console.log('[Dependency Tree] Script started');
        console.log('[Dependency Tree] Loaded', nodes.length, 'nodes and', edges.length, 'edges');
        console.log('[Dependency Tree] Nodes:', JSON.stringify(nodes.slice(0, 5)));
        console.log('[Dependency Tree] Edges:', edges);

        // DEBUG: Show visible indicator if nodes exist
        if (nodes.length === 0) {
            document.body.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--vscode-errorForeground);"><h2>' + localized.emptyTitle + '</h2><p>' + localized.emptyDescription + '</p></div>';
        }

        const nodeElements = new Map();
        const nodePositions = new Map();

        // Restore previous state if available
        const previousState = vscode.getState() || {};
        let savedPositions = previousState.nodePositions || {};
        let lastSelectedNodeId = previousState.lastSelectedNodeId;
        let selectedEdge = null;
        let linkSourceId = null;
        const linkHint = document.getElementById('linkHint');

        const removeEdgeButton = document.getElementById('removeEdgeButton');
        if (removeEdgeButton) {
            removeEdgeButton.addEventListener('click', () => {
                if (selectedEdge) {
                    vscode.postMessage({
                        command: 'removeDependency',
                        sourceId: selectedEdge.from,
                        targetId: selectedEdge.to,
                    });
                } else if (lastSelectedNodeId) {
                    vscode.postMessage({
                        command: 'removeDependency',
                        contextId: lastSelectedNodeId,
                    });
                }
            });
        }

        function updateHint(text) {
            if (linkHint) {
                linkHint.textContent = text;
            }
        }

        if (dependencyEditingEnabled) {
            updateHint('Shift+Click a node to add a dependency');
        }

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
            savedPositions = positions;
            vscode.setState({ nodePositions: positions, lastSelectedNodeId });
        }

        function createNode(node) {
            const div = document.createElement('div');
            div.className = 'node status-' + node.status;
            div.dataset.nodeId = node.id;

            const idRow = document.createElement('div');
            idRow.className = 'node-id';

            const statusIndicator = document.createElement('span');
            statusIndicator.className = 'status-indicator ' + node.status;

            const idText = document.createElement('span');
            idText.textContent = node.id;

            idRow.appendChild(statusIndicator);
            idRow.appendChild(idText);

            const titleRow = document.createElement('div');
            titleRow.className = 'node-title';
            titleRow.title = node.title || '';
            titleRow.textContent = node.title || '';

            div.appendChild(idRow);
            div.appendChild(titleRow);

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

            // Click to open (only if not dragged) or to add dependency when enabled
            div.addEventListener('click', (e) => {
                if (isDragging) {
                    return;
                }

                if (dependencyEditingEnabled && (e.shiftKey || linkSourceId)) {
                    if (!linkSourceId) {
                        linkSourceId = node.id;
                        updateHint('Select a target for ' + node.id);
                    } else if (linkSourceId === node.id) {
                        linkSourceId = null;
                        updateHint('Link cancelled');
                    } else {
                        vscode.postMessage({
                            command: 'addDependency',
                            sourceId: linkSourceId,
                            targetId: node.id,
                        });
                        linkSourceId = null;
                        updateHint('Shift+Click a node to add a dependency');
                    }
                    return;
                }

                selectedEdge = null;
                lastSelectedNodeId = node.id;
                vscode.setState({ nodePositions: savedPositions, lastSelectedNodeId });
                vscode.postMessage({
                    command: 'openBead',
                    beadId: node.id
                });
            });

            return div;
        }

        function buildArrowheadDefs() {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '10');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3');
            marker.setAttribute('orient', 'auto');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 3, 0 6');
            polygon.setAttribute('fill', 'var(--vscode-panel-border)');
            marker.appendChild(polygon);
            defs.appendChild(marker);
            return defs;
        }

        function drawEdge(from, to, type) {
            const fromPos = nodePositions.get(from);
            const toPos = nodePositions.get(to);

            if (!fromPos || !toPos) return null;

            const fromEl = nodeElements.get(from);
            const toEl = nodeElements.get(to);

            if (!fromEl || !toEl) return null;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            const x1 = fromPos.x + (fromRect.width / 2);
            const y1 = fromPos.y + fromRect.height;
            const x2 = toPos.x + (toRect.width / 2);
            const y2 = toPos.y;

            // Draw curved line
            const midY = (y1 + y2) / 2;
            const path = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', path);
            pathEl.setAttribute('class', 'edge ' + (type || ''));
            pathEl.setAttribute('data-from', from);
            pathEl.setAttribute('data-to', to);
            return pathEl;
        }

        function paintEdges(svg) {
            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }
            svg.appendChild(buildArrowheadDefs());
            edges.forEach((edge) => {
                const pathEl = drawEdge(edge.from, edge.to, edge.type);
                if (pathEl) {
                    svg.appendChild(pathEl);
                }
            });
            bindEdgeClicks();
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
                paintEdges(svg);
                console.log('[Dependency Tree] SVG edges rendered');
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
            if (!svg) return;
            paintEdges(svg);
        }
        function bindEdgeClicks() {
            const edgeEls = Array.from(document.querySelectorAll('path.edge')) as any[];
            edgeEls.forEach((el) => {
                el.addEventListener('click', () => {
                    edgeEls.forEach((e) => e.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedEdge = { from: el.getAttribute('data-from'), to: el.getAttribute('data-to') };
                });
                el.addEventListener('dblclick', () => {
                    if (dependencyEditingEnabled) {
                        vscode.postMessage({
                            command: 'removeDependency',
                            sourceId: el.getAttribute('data-from'),
                            targetId: el.getAttribute('data-to'),
                        });
                    }
                });
            });
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
            document.body.innerHTML = '<div style="padding: 40px; color: var(--vscode-errorForeground);"><h2>' + localized.renderErrorTitle + '</h2><pre>' + err.message + '</pre></div>';
        }
    </script>
</body>
</html>`;
}

async function openBead(item: BeadItemData, provider: BeadsTreeDataProvider): Promise<void> {
  const nonce = createNonce();
  const panel = vscode.window.createWebviewPanel(
    'beadDetail',
    item.id,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd())), provider['context']?.extensionUri ?? vscode.Uri.file(process.cwd())],
    }
  );

  // Get all items from the provider to calculate reverse dependencies
  const allItems = provider['items'] as BeadItemData[];
  const statusLabels = getStatusLabels();
  const beadStrings = buildBeadDetailStrings(statusLabels);
  const locale = vscode.env.language || 'en';
  panel.webview.html = getBeadDetailHtml(item, allItems, panel.webview, nonce, beadStrings, locale);

  // Register this panel so it can be refreshed when data changes
  provider.registerPanel(item.id, panel);

  // Handle messages from the webview
  const allowedCommands: AllowedLittleGlenCommand[] = [
    'updateStatus',
    'updateTitle',
    'editAssignee',
    'addLabel',
    'removeLabel',
    'addDependency',
    'removeDependency',
    'deleteBead',
    'openBead',
    'openExternalUrl'
  ];

  panel.webview.onDidReceiveMessage(async (message) => {
    const validated = validateLittleGlenMessage(message, allowedCommands);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid panel message');
      void vscode.window.showWarningMessage(t('Ignored invalid request from Little Glen panel.'));
      return;
    }

    switch (validated.command) {
      case 'updateStatus':
        await provider.updateStatus(item, validated.status);
        return;
      case 'updateTitle':
        await provider.updateTitle(item, validated.title);
        return;
      case 'editAssignee':
        await editAssignee(provider, undefined, item);
        return;
      case 'addLabel':
        if (!validated.label) {
          const input = await vscode.window.showInputBox({
            placeHolder: t('Label name'),
            prompt: t('Enter a label to add'),
            validateInput: (value) => {
              const res = validateLabelInput(value);
              return res.valid ? null : t('Invalid label format');
            }
          });
          if (input) {
            await provider.addLabel(item, input);
          }
        } else {
          await provider.addLabel(item, validated.label);
        }
        return;
      case 'removeLabel':
        await provider.removeLabel(item, validated.label);
        return;
      case 'addDependency': {
        const sourceId = validated.sourceId ?? item.id;
        const targetId = validated.targetId;
        const sourceItem = (provider as any)['items']?.find((i: BeadItemData) => i.id === sourceId) ?? item;
        await addDependencyCommand(provider, sourceItem, targetId ? { sourceId, targetId } : undefined);
        return;
      }
      case 'removeDependency': {
        await removeDependencyCommand(provider, validated.sourceId && validated.targetId ? {
          sourceId: validated.sourceId,
          targetId: validated.targetId,
        } : undefined, { contextId: item.id });
        return;
      }
      case 'deleteBead': {
        const projectRoot = resolveProjectRoot(vscode.workspace.getConfiguration('beady'));
        if (!projectRoot) {
          void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
          return;
        }

        const deleteLabel = t('Delete');
        const answer = await vscode.window.showWarningMessage(
          t('Are you sure you want to delete this bead?\n\n{0}', item.id),
          { modal: true },
          deleteLabel
        );
        if (answer !== deleteLabel) {
          return;
        }

        try {
          await runBdCommand(['delete', item.id, '--force'], projectRoot);
          await provider.refresh();
          panel.dispose();
        } catch (error) {
          console.error('Failed to delete bead from detail view', error);
          void vscode.window.showErrorMessage(formatError(t('Failed to delete bead'), error));
        }
        return;
      }
      case 'openBead': {
        const targetBead = allItems.find((i) => i.id === validated.beadId);
        if (targetBead) {
          await openBead(targetBead, provider);
        } else {
          void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
        }
        return;
      }
      case 'openExternalUrl':
        await vscode.env.openExternal(vscode.Uri.parse(validated.url));
        return;
    }
  });
}

/**
 * Open a bead from the activity feed by ID, with graceful fallback if missing.
 * Returns true when a bead was opened successfully.
 */
async function openBeadFromFeed(
  issueId: string,
  beadsProvider: BeadsTreeDataProvider,
  opener: (item: BeadItemData, provider: BeadsTreeDataProvider) => Promise<void> = openBead
): Promise<boolean> {
  const items = beadsProvider['items'] as BeadItemData[] | undefined;
  const target = items?.find((i) => i.id === issueId);

  if (!target) {
    console.warn(`[ActivityFeed] Issue ${issueId} not found when opening from feed`);
    void vscode.window.showWarningMessage(t('Issue {0} no longer exists or is not loaded.', issueId));
    return false;
  }

  try {
    await opener(target, beadsProvider);
    return true;
  } catch (error) {
    console.error(`[ActivityFeed] Failed to open issue ${issueId} from feed:`, error);
    void vscode.window.showErrorMessage(formatError(t('Failed to open issue from activity feed'), error));
    return false;
  }
}

async function createBead(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: t('Enter a title for the new bead'),
    placeHolder: t('Implement feature X'),
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  try {
    await runBdCommand(['create', name], projectRoot!);
    void vscode.commands.executeCommand('beady.refresh');
    void vscode.window.showInformationMessage(t('Created bead: {0}', name));
  } catch (error) {
    void vscode.window.showErrorMessage(formatError(t('Failed to create bead'), error));
  }
}

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

async function addDependencyCommand(
  provider: BeadsTreeDataProvider,
  sourceItem?: BeadItemData,
  edge?: { sourceId?: string; targetId?: string }
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
    return;
  }

  const items = (provider as any)['items'] as BeadItemData[] | undefined;
  const safeEdgeSource = edge?.sourceId ? sanitizeDependencyId(edge.sourceId) : undefined;
  const safeEdgeTarget = edge?.targetId ? sanitizeDependencyId(edge.targetId) : undefined;

  if ((edge?.sourceId && !safeEdgeSource) || (edge?.targetId && !safeEdgeTarget)) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const source =
    sourceItem ??
    (safeEdgeSource ? items?.find((i) => i.id === safeEdgeSource) : undefined) ??
    (await pickBeadQuick(items, t('Select the issue that depends on another item')));

  if (!source) {
    return;
  }

  const target = safeEdgeTarget
    ? items?.find((i) => i.id === safeEdgeTarget)
    : await pickBeadQuick(items, t('Select the issue {0} depends on', source.id), source.id);

  if (!target) {
    return;
  }

  const safeSourceId = sanitizeDependencyId(source.id);
  const safeTargetId = sanitizeDependencyId(target.id);
  if (!safeSourceId || !safeTargetId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const validationError = validateDependencyAdd(items ?? [], safeSourceId, safeTargetId);
  if (validationError) {
    void vscode.window.showWarningMessage(t(validationError));
    return;
  }

  await provider.addDependency(source, safeTargetId);
}

async function removeDependencyCommand(provider: BeadsTreeDataProvider, edge?: DependencyEdge, options?: { contextId?: string }): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const dependencyEditingEnabled = config.get<boolean>('enableDependencyEditing', false);
  if (!dependencyEditingEnabled) {
    void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
    return;
  }

  const items = (provider as any)['items'] as BeadItemData[] | undefined;
  const safeContextId = options?.contextId ? sanitizeDependencyId(options.contextId) : undefined;
  if (options?.contextId && !safeContextId) {
    void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
    return;
  }

  const edges = collectDependencyEdges(items);
  const scopedEdges = safeContextId
    ? edges.filter((e) => e.sourceId === safeContextId || e.targetId === safeContextId)
    : edges;

  let selectedEdge = edge;
  if (selectedEdge) {
    const safeProvidedSource = sanitizeDependencyId(selectedEdge.sourceId);
    const safeProvidedTarget = sanitizeDependencyId(selectedEdge.targetId);
    if (!safeProvidedSource || !safeProvidedTarget) {
      void vscode.window.showWarningMessage(INVALID_ID_MESSAGE);
      return;
    }
    selectedEdge = { ...selectedEdge, sourceId: safeProvidedSource, targetId: safeProvidedTarget };
  }

  if (!selectedEdge) {
    if (scopedEdges.length === 0) {
      void vscode.window.showWarningMessage(t('No dependencies available to remove.'));
      return;
    }

    const picks = scopedEdges.map((e) => ({
      label: `${e.sourceId} → ${e.targetId}`,
      description: e.type,
      detail: [e.sourceTitle, e.targetTitle].filter((v) => v && v.length > 0).join(' → '),
      edge: e,
    }));

    const selection = await vscode.window.showQuickPick(picks, { placeHolder: t('Select a dependency to remove') });
    if (!selection) {
      return;
    }
    selectedEdge = selection.edge;
  }

  if (!selectedEdge) {
    return;
  }

  await provider.removeDependency(selectedEdge.sourceId, selectedEdge.targetId);
}

async function visualizeDependencies(provider: BeadsTreeDataProvider): Promise<void> {
  createDependencyGraphView({
    getItems: () => provider['items'] as BeadItemData[],
    openBead: async (bead) => openBead(bead, provider),
    addDependency: async (sourceId, targetId) => {
      await addDependencyCommand(provider, undefined, { sourceId, targetId });
    },
    removeDependency: async (sourceId, targetId, contextId) => {
      await removeDependencyCommand(
        provider,
        sourceId && targetId ? { sourceId, targetId } : undefined,
        { contextId }
      );
    },
  });
}


function deriveAssigneeName(bead: BeadItemData, fallback: string): string {
  const typed = (bead as any).assignee;
  if (typeof typed === 'string' && typed.trim().length > 0) {
    return typed.trim();
  }

  const raw = bead.raw as any;
  const candidates = [
    raw?.assignee,
    raw?.assignee_name,
    raw?.assigneeName,
    raw?.assigned_to,
    raw?.owner,
    raw?.user,
    raw?.author
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object' && typeof candidate.name === 'string' && candidate.name.trim().length > 0) {
      return candidate.name.trim();
    }
  }

  return fallback;
}

function colorForAssignee(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function formatInProgressAge(timestamp: string | undefined): { label: string; ms?: number } {
  if (!timestamp) {
    return { label: t('N/A'), ms: undefined };
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { label: t('N/A'), ms: undefined };
  }

  const diffMs = Date.now() - date.getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  let label: string;
  if (days > 0) {
    label = hours > 0 ? t('{0}d {1}h', days, hours) : t('{0}d', days);
  } else if (hours > 0) {
    label = t('{0}h', hours);
  } else {
    label = t('{0}m', minutes);
  }

  return { label, ms: diffMs };
}

function getInProgressPanelHtml(items: BeadItemData[], strings: InProgressPanelStrings, locale: string): string {
  const normalized = items.map((item) => {
    const ageInfo = formatInProgressAge(item.inProgressSince ?? item.updatedAt);
    const assigneeRaw = deriveAssigneeName(item, strings.assigneeFallback);
    const assignee = sanitizeInlineText(assigneeRaw) || strings.assigneeFallback;
    const color = colorForAssignee(assigneeRaw || strings.assigneeFallback);
    return {
      item,
      ageLabel: ageInfo.label,
      ageMs: ageInfo.ms,
      assignee,
      color,
      blockers: item.blockingDepsCount ?? 0,
    };
  });

  const totalBlockers = normalized.reduce((sum, entry) => sum + (entry.blockers ?? 0), 0);
  const blockedItems = normalized.filter((entry) => (entry.blockers ?? 0) > 0).length;

  const assigneeCounts = new Map<string, { count: number; color: string }>();
  for (const entry of normalized) {
    const existing = assigneeCounts.get(entry.assignee);
    if (existing) {
      existing.count += 1;
    } else {
      assigneeCounts.set(entry.assignee, { count: 1, color: entry.color });
    }
  }

  const topAssignees = Array.from(assigneeCounts.entries())
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 3);

  const oldest = normalized
    .filter((entry) => entry.ageMs !== undefined)
    .sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0))
    .slice(0, 3);

  const orderedItems = normalized
    .slice()
    .sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0) || a.item.id.localeCompare(b.item.id, locale, { sensitivity: 'base' }));

  const summaryAssignees = topAssignees.length > 0
    ? topAssignees.map(([name, meta]) => `
        <div class="pill" style="border-color: ${meta.color}; background-color: ${meta.color}22; color: ${meta.color};">
          <span class="pill-dot" style="background-color: ${meta.color};"></span>
          <span class="pill-label">${escapeHtml(name)}</span>
          <span class="pill-count">${meta.count}</span>
        </div>
      `).join('')
    : `<div class="muted">${escapeHtml(t('No assignees yet'))}</div>`;

  const oldestList = oldest.length > 0
    ? oldest.map((entry) => `
        <div class="oldest-row" data-issue-id="${escapeHtml(entry.item.id)}">
          <span class="oldest-id">#${escapeHtml(entry.item.id)}</span>
          <span class="oldest-title">${escapeHtml(entry.item.title)}</span>
          <span class="oldest-age">${escapeHtml(entry.ageLabel)}</span>
        </div>
      `).join('')
    : `<div class="muted">${escapeHtml(t('No aging data yet'))}</div>`;

  const listItems = orderedItems.length > 0
    ? orderedItems.map((entry) => `
        <div class="wip-card" data-issue-id="${escapeHtml(entry.item.id)}" title="${escapeHtml(strings.openLabel)}">
          <div class="wip-card-top">
            <div class="id-chip">#${escapeHtml(entry.item.id)}</div>
            <div class="assignee" style="border-color: ${entry.color}; background-color: ${entry.color}22; color: ${entry.color};">
              <span class="pill-dot" style="background-color: ${entry.color};"></span>
              <span class="assignee-name">${escapeHtml(entry.assignee)}</span>
            </div>
          </div>
          <div class="wip-title">${escapeHtml(entry.item.title)}</div>
          <div class="wip-meta">
            <span class="meta-item">${escapeHtml(strings.ageLabel)}: <strong>${escapeHtml(entry.ageLabel)}</strong></span>
            <span class="meta-item">${escapeHtml(strings.blockersCountLabel)}: <strong>${entry.blockers}</strong></span>
          </div>
        </div>
      `).join('')
    : `<div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>${escapeHtml(strings.emptyTitle)}</h3>
        <p>${escapeHtml(strings.emptyDescription)}</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(strings.title)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: radial-gradient(circle at 20% 20%, rgba(55, 148, 255, 0.06), transparent 25%),
                  radial-gradient(circle at 80% 0%, rgba(249, 197, 19, 0.05), transparent 22%),
                  var(--vscode-editor-background);
      margin: 0;
      padding: 20px 24px 40px;
      line-height: 1.5;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.2px;
    }
    .subtle {
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .summary-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 14px 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    .summary-label {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 700;
      margin-top: 6px;
      display: block;
    }
    .summary-subtext {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin-top: 2px;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      background: var(--vscode-editor-background);
    }
    .pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      background: var(--vscode-descriptionForeground);
    }
    .pill-count {
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
    .panel-section {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 10px 0;
      letter-spacing: 0.2px;
    }
    .oldest-row {
      display: grid;
      grid-template-columns: 80px 1fr 80px;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      align-items: center;
      cursor: pointer;
    }
    .oldest-row:last-child {
      border-bottom: none;
    }
    .oldest-row:hover {
      background: var(--vscode-list-hoverBackground);
      border-radius: 6px;
      padding-left: 6px;
    }
    .oldest-id {
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
    }
    .oldest-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .oldest-age {
      text-align: right;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }
    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .list-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }
    .wip-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 10px;
    }
    .wip-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .wip-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      border-color: var(--vscode-focusBorder);
    }
    .wip-card-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .id-chip {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .assignee {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-inactiveSelectionBackground);
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .assignee-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
    }
    .wip-title {
      font-weight: 700;
      margin: 0 0 6px 0;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .wip-meta {
      display: flex;
      gap: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      flex-wrap: wrap;
    }
    .meta-item strong {
      color: var(--vscode-foreground);
    }
    .empty-state {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 40px 10px;
    }
    .empty-icon {
      font-size: 40px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="layout">
    <div>
      <h1>${escapeHtml(strings.title)}</h1>
      <div class="subtle">${escapeHtml(strings.wipSubtitle)}</div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(strings.wipLabel)}</div>
        <span class="summary-value">${normalized.length}</span>
        <div class="summary-subtext">${escapeHtml(strings.wipSubtitle)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(strings.blockersLabel)}</div>
        <span class="summary-value">${blockedItems}</span>
        <div class="summary-subtext">${escapeHtml(strings.blockedItemsLabel)} · ${escapeHtml(t('{0} total', totalBlockers))}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(strings.topAssigneesLabel)}</div>
        <div class="pill-row">${summaryAssignees}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(strings.oldestLabel)}</div>
        <div>${oldest.length > 0 ? escapeHtml(oldest[0].ageLabel) : escapeHtml(t('N/A'))}</div>
        <div class="summary-subtext">${oldest.length > 0 ? escapeHtml(oldest[0].item.title) : escapeHtml(t('No aging data yet'))}</div>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-title">${escapeHtml(strings.topAssigneesLabel)}</div>
      <div class="pill-row">${summaryAssignees}</div>
    </div>

    <div class="panel-section">
      <div class="section-title">${escapeHtml(strings.oldestLabel)}</div>
      ${oldestList}
    </div>

    <div class="panel-section">
      <div class="list-header">
        <h2 class="list-title">${escapeHtml(strings.listTitle)}</h2>
      </div>
      <div class="wip-list">
        ${listItems}
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-issue-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const issueId = card.getAttribute('data-issue-id');
        if (issueId) {
          vscode.postMessage({ command: 'openBead', beadId: issueId });
        }
      });
    });
  </script>
</body>
</html>`;
}

async function openInProgressPanel(provider: BeadsTreeDataProvider): Promise<void> {
  const strings = buildInProgressPanelStrings();
  const locale = vscode.env.language || 'en';
  const panel = vscode.window.createWebviewPanel(
    'inProgressSpotlight',
    strings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  if (!(provider as any)['items'] || (provider as any)['items'].length === 0) {
    await provider.refresh();
  }

  const render = (): void => {
    const items = (provider as any)['items'] as BeadItemData[] || [];
    const inProgress = items.filter((item) => item.status === 'in_progress');
    panel.webview.html = getInProgressPanelHtml(inProgress, strings, locale);
  };

  render();

  const subscription = provider.onDidChangeTreeData(() => render());
  panel.onDidDispose(() => subscription.dispose());

  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid in-progress panel message');
      return;
    }

    if (validated.command === 'openBead') {
      const items = (provider as any)['items'] as BeadItemData[] || [];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (item) {
        await openBead(item, provider);
      } else {
        void vscode.window.showWarningMessage(t('Issue {0} not found', validated.beadId));
      }
    }
  });
}

function getActivityFeedPanelHtml(events: import('./activityFeed').EventData[], strings: ActivityFeedStrings, locale: string): string {
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
    const time = event.createdAt.toLocaleString(locale);
    const actorLabel = escapeHtml(t('by {0}', event.actor));
    
    return `
      <div class="event-card" data-issue-id="${escapeHtml(event.issueId)}">
        <div class="timeline-dot" style="background-color: ${color};">${icon}</div>
        <div class="event-content">
          <div class="event-header">
            <span class="event-description">${escapeHtml(event.description)}</span>
            <span class="event-time" title="${time}">${escapeHtml(event.createdAt.toLocaleTimeString(locale))}</span>
          </div>
          ${event.issueTitle ? `<div class="event-issue">${escapeHtml(event.issueTitle)}</div>` : ''}
          <div class="event-meta">
            <span class="event-actor">${actorLabel}</span>
            <span class="event-id">#${escapeHtml(event.issueId)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(strings.title)}</title>
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
        <h1 class="activity-title">${escapeHtml(strings.title)}</h1>
        <span class="event-count">${escapeHtml(t('{0} {1}', events.length, strings.eventsLabel))}</span>
    </div>
    
    ${events.length > 0 ? `
    <div class="timeline">
        ${eventCards}
    </div>
    ` : `
    <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>${escapeHtml(strings.emptyTitle)}</h3>
        <p>${escapeHtml(strings.emptyDescription)}</p>
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
  const activityStrings = buildActivityFeedStrings();
  const locale = vscode.env.language || 'en';
  const panel = vscode.window.createWebviewPanel(
    'activityFeedPanel',
    activityStrings.title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get events from the provider
  const projectRoot = vscode.workspace.getConfiguration('beady').get<string>('projectRoot') ||
    (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
  
  const { fetchEvents } = await import('./activityFeed');
  const result = await fetchEvents(projectRoot, { limit: 100 });

  panel.webview.html = getActivityFeedPanelHtml(result.events, activityStrings, locale);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (message) => {
    const allowed: AllowedLittleGlenCommand[] = ['openBead'];
    const validated = validateLittleGlenMessage(message, allowed);
    if (!validated) {
      console.warn('[Little Glen] Ignoring invalid activity feed message');
      return;
    }
    if (validated.command === 'openBead') {
      const items = beadsProvider['items'] as BeadItemData[];
      const item = items.find((i: BeadItemData) => i.id === validated.beadId);
      if (item) {
        await openBead(item, beadsProvider);
      } else {
        // If item not found in current view, just show a message
        void vscode.window.showInformationMessage(t('Opening issue {0}', validated.beadId));
      }
    }
  });
}

async function exportBeadsCsv(provider: BeadsTreeDataProvider, treeView: vscode.TreeView<TreeItemType>): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('exportCsv.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.exportCsv.enabled" setting to export beads to CSV.')
    );
    return;
  }

  const selectedBeads = treeView.selection
    .filter((item): item is BeadTreeItem => item instanceof BeadTreeItem)
    .map((item) => item.bead);

  const beadsToExport = selectedBeads.length > 0 ? selectedBeads : provider.getVisibleBeads();

  if (!beadsToExport || beadsToExport.length === 0) {
    void vscode.window.showInformationMessage(t('No beads to export. Adjust your selection or filters and try again.'));
    return;
  }

  const defaultWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const defaultUri = defaultWorkspace
    ? vscode.Uri.file(path.join(defaultWorkspace, 'beads-export.csv'))
    : undefined;

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { CSV: ['csv'], 'All Files': ['*'] },
    saveLabel: t('Export'),
  });

  if (!saveUri) {
    return;
  }

  const headers: CsvExportHeaders = {
    id: t('ID'),
    title: t('Title'),
    status: t('Status'),
    type: t('Type'),
    labels: t('Labels'),
    updated: t('Updated'),
  };

  try {
    await writeBeadsCsvFile(beadsToExport, headers, saveUri.fsPath, {
      delimiter: config.get<string>('exportCsv.delimiter', ','),
      includeBom: config.get<boolean>('exportCsv.includeBom', false),
    });
    void vscode.window.showInformationMessage(
      t('Exported {0} bead(s) to {1}', beadsToExport.length, path.basename(saveUri.fsPath))
    );
  } catch (error) {
    console.error('Failed to export beads', error);
    void vscode.window.showErrorMessage(formatError(t('Failed to export beads'), error));
  }
}

async function exportBeadsMarkdown(provider: BeadsTreeDataProvider, treeView: vscode.TreeView<TreeItemType>): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('exportMarkdown.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.exportMarkdown.enabled" setting to export beads to Markdown.')
    );
    return;
  }

  const selectedBeads = treeView.selection
    .filter((item): item is BeadTreeItem => item instanceof BeadTreeItem)
    .map((item) => item.bead);

  const beadsToExport = selectedBeads.length > 0 ? selectedBeads : provider.getVisibleBeads();

  if (!beadsToExport || beadsToExport.length === 0) {
    void vscode.window.showInformationMessage(t('No beads to export. Adjust your selection or filters and try again.'));
    return;
  }

  const defaultWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const defaultUri = defaultWorkspace
    ? vscode.Uri.file(path.join(defaultWorkspace, 'beads-export.md'))
    : undefined;

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Markdown: ['md'], 'All Files': ['*'] },
    saveLabel: t('Export'),
  });

  if (!saveUri) {
    return;
  }

  const headers: MarkdownExportHeaders = {
    id: t('ID'),
    title: t('Title'),
    status: t('Status'),
    type: t('Type'),
    labels: t('Labels'),
    updated: t('Updated'),
  };

  try {
    await writeBeadsMarkdownFile(beadsToExport, headers, saveUri.fsPath);
    void vscode.window.showInformationMessage(
      t('Exported {0} bead(s) to {1}', beadsToExport.length, path.basename(saveUri.fsPath))
    );
  } catch (error) {
    console.error('Failed to export beads', error);
    void vscode.window.showErrorMessage(formatError(t('Failed to export beads'), error));
  }
}

async function confirmBulkAction(actionDescription: string, count: number): Promise<boolean> {
  const proceed = t('Proceed');
  const response = await vscode.window.showWarningMessage(
    t('Apply {0} to {1} bead(s)?', actionDescription, count),
    { modal: true },
    proceed
  );

  return response === proceed;
}

async function showBulkResultSummary(
  actionDescription: string,
  result: BulkOperationResult,
  projectRoot: string
): Promise<void> {
  const sanitizedResult: BulkOperationResult = {
    successes: result.successes,
    failures: result.failures.map((failure) => ({
      ...failure,
      error: sanitizeErrorMessage(failure.error, [projectRoot]),
    })),
  };

  const summary = summarizeBulkResult(sanitizedResult);

  if (summary.failureCount === 0) {
    void vscode.window.showInformationMessage(
      t('{0} succeeded for {1} bead(s)', actionDescription, summary.successCount)
    );
    return;
  }

  const failureList = summary.failureList || summary.failureIds.join(', ');
  const message =
    summary.successCount === 0
      ? t('{0} failed for {1} bead(s): {2}', actionDescription, summary.failureCount, failureList)
      : t(
          '{0} completed with {1} success(es); failed for {2}: {3}',
          actionDescription,
          summary.successCount,
          summary.failureCount,
          failureList
        );

  const copyAction = t('Copy failures');
  const viewAction = t('View failed IDs');
  const selection =
    summary.successCount === 0
      ? await vscode.window.showErrorMessage(message, copyAction, viewAction)
      : await vscode.window.showWarningMessage(message, copyAction, viewAction);

  if (selection === copyAction) {
    await vscode.env.clipboard.writeText(failureList);
    void vscode.window.showInformationMessage(t('Copied failed ids to clipboard'));
  } else if (selection === viewAction) {
    const pick = await vscode.window.showQuickPick(summary.failureIds, {
      placeHolder: t('Select a failed bead id to copy'),
    });
    if (pick) {
      await vscode.env.clipboard.writeText(pick);
      void vscode.window.showInformationMessage(t('Copied {0}', pick));
    }
  }
}

async function bulkUpdateStatus(
  provider: BeadsTreeDataProvider,
  treeView: vscode.TreeView<TreeItemType>,
  runCommand: RunBdCommandFn = runBdCommand
): Promise<void> {
  const bulkConfig = getBulkActionsConfig();

  if (!bulkConfig.enabled) {
    const message = bulkConfig.validationError
      ? t('Bulk actions are disabled: {0}', bulkConfig.validationError)
      : t('Enable "beady.bulkActions.enabled" to run bulk status updates.');
    void vscode.window.showWarningMessage(message);
    return;
  }

  const selection = treeView.selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
  const { ids, error } = buildBulkSelection(selection.map((item) => item.bead), bulkConfig.maxSelection);

  if (error) {
    if (ids.length === 0) {
      void vscode.window.showWarningMessage(t('Select one or more beads to update.'));
    } else {
      void vscode.window.showWarningMessage(
        t('Select at most {0} beads for bulk update (selected {1}).', bulkConfig.maxSelection, ids.length)
      );
    }
    return;
  }

  const statusLabels = getStatusLabels();
  const statusPick = await vscode.window.showQuickPick(
    [
      { label: statusLabels.open, value: 'open' },
      { label: statusLabels.in_progress, value: 'in_progress' },
      { label: statusLabels.blocked, value: 'blocked' },
      { label: statusLabels.closed, value: 'closed' },
    ],
    {
      placeHolder: t('Set status for {0} bead(s)', ids.length),
    }
  );

  if (!statusPick) {
    return;
  }

  const actionDescription = t('set status to "{0}"', statusPick.label);
  const confirmed = await confirmBulkAction(actionDescription, ids.length);
  if (!confirmed) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const progressTitle = t('Updating status to "{0}" for {1} bead(s)...', statusPick.label, ids.length);

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async (progress) => {
      return executeBulkStatusUpdate(
        ids,
        statusPick.value,
        async (id) => {
          await runCommand(['update', id, '--status', statusPick.value], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();
  await showBulkResultSummary(actionDescription, result, projectRoot);
}

async function bulkUpdateLabel(
  provider: BeadsTreeDataProvider,
  treeView: vscode.TreeView<TreeItemType>,
  action: BulkLabelAction,
  runCommand: RunBdCommandFn = runBdCommand
): Promise<void> {
  const bulkConfig = getBulkActionsConfig();

  if (!bulkConfig.enabled) {
    const message = bulkConfig.validationError
      ? t('Bulk actions are disabled: {0}', bulkConfig.validationError)
      : t('Enable "beady.bulkActions.enabled" to run bulk label updates.');
    void vscode.window.showWarningMessage(message);
    return;
  }

  const selection = treeView.selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
  const { ids, error } = buildBulkSelection(selection.map((item) => item.bead), bulkConfig.maxSelection);

  if (error) {
    if (ids.length === 0) {
      void vscode.window.showWarningMessage(t('Select one or more beads to update.'));
    } else {
      void vscode.window.showWarningMessage(
        t('Select at most {0} beads for bulk update (selected {1}).', bulkConfig.maxSelection, ids.length)
      );
    }
    return;
  }

  const labelInput = await vscode.window.showInputBox({
    prompt: t('Enter a label to {0}', action === 'add' ? t('add') : t('remove')),
    placeHolder: t('example: urgent'),
    validateInput: (value) => {
      const result = validateLabelInput(value);
      return result.valid ? undefined : validationMessage('label', result.reason);
    }
  });

  if (!labelInput) {
    return;
  }

  const labelResult = validateLabelInput(labelInput);
  if (!labelResult.valid || !labelResult.value) {
    void vscode.window.showWarningMessage(validationMessage('label', labelResult.reason));
    return;
  }

  const label = labelResult.value;
  const actionDescription = action === 'add' ? t('add label "{0}"', label) : t('remove label "{0}"', label);

  const confirmed = await confirmBulkAction(actionDescription, ids.length);
  if (!confirmed) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beady');
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const progressTitle = action === 'add'
    ? t('Adding label "{0}" to {1} bead(s)...', label, ids.length)
    : t('Removing label "{0}" from {1} bead(s)...', label, ids.length);

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async (progress) => {
      return executeBulkLabelUpdate(
        ids,
        label,
        action,
        async (id) => {
          await runCommand(['label', action, id, label], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();
  await showBulkResultSummary(actionDescription, result, projectRoot);
}

async function selectWorkspace(provider: BeadsTreeDataProvider): Promise<void> {
  const workspaces = vscode.workspace.workspaceFolders ?? [];
  const options = getWorkspaceOptions(workspaces);

  if (options.length <= 1) {
    void vscode.window.showInformationMessage(t('No additional workspaces to select.'));
    return;
  }

  const pick = await vscode.window.showQuickPick(
    options.map((opt) => ({ label: opt.label, value: opt.id })),
    { placeHolder: t('Select workspace for Beads view') }
  );

  if (!pick) {
    return;
  }

  await provider.setActiveWorkspace(pick.value);
}

type RunBdCommandFn = (args: string[], projectRoot: string, options?: BdCommandOptions) => Promise<void>;

async function toggleFavorites(
  provider: BeadsTreeDataProvider,
  treeView: vscode.TreeView<TreeItemType>,
  context: vscode.ExtensionContext,
  runCommand: RunBdCommandFn = runBdCommand
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const favoritesEnabled = config.get<boolean>('favorites.enabled', false);
  if (!favoritesEnabled) {
    void vscode.window.showWarningMessage(t('Enable "beady.favorites.enabled" to toggle favorites.'));
    return;
  }

  const useLabelStorage = config.get<boolean>('favorites.useLabelStorage', true);
  const favoriteLabelRaw = getFavoriteLabel(config);

  if (!isValidFavoriteLabel(favoriteLabelRaw)) {
    void vscode.window.showErrorMessage(
      t('Favorite label is invalid. Use letters, numbers, spaces, ".", ":", "_" or "-".')
    );
    return;
  }

  const favoriteLabel = sanitizeFavoriteLabel(favoriteLabelRaw);

  const selection = treeView.selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
  if (selection.length === 0) {
    void vscode.window.showWarningMessage(t('Select one or more beads to toggle favorites.'));
    return;
  }

  const { valid, invalidIds, duplicateIds } = validateFavoriteTargets(selection.map((item) => item.bead));

  if (invalidIds.length > 0) {
    void vscode.window.showErrorMessage(t('Invalid bead id(s): {0}', invalidIds.join(', ')));
  }

  if (duplicateIds.length > 0) {
    void vscode.window.showWarningMessage(t('Ignoring duplicate selection(s): {0}', duplicateIds.join(', ')));
  }

  if (valid.length === 0) {
    return;
  }

  const projectRoot = resolveProjectRoot(config);
  if (useLabelStorage && !projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const localFavorites = getLocalFavorites(context);
  const successes: string[] = [];
  const failures: BulkOperationFailure[] = [];
  let toggledOn = 0;
  let toggledOff = 0;

  for (const bead of valid) {
    const labels: string[] = Array.isArray((bead.raw as any)?.labels) ? (bead.raw as any).labels : [];
    const hasLabel = labels.includes(favoriteLabel);
    const isFavorite = hasLabel || localFavorites.has(bead.id);
    const targetFavorite = !isFavorite;

    const applyLocal = (): void => {
      if (targetFavorite) {
        localFavorites.add(bead.id);
        toggledOn += 1;
      } else {
        localFavorites.delete(bead.id);
        toggledOff += 1;
      }
    };

    try {
      if (useLabelStorage) {
        const action = targetFavorite ? 'add' : 'remove';
        await runCommand(['label', action, bead.id, favoriteLabel], projectRoot!);
      }

      applyLocal();
      successes.push(bead.id);
    } catch (error) {
      applyLocal();
      const message = sanitizeFavoriteError(error, projectRoot ? [projectRoot] : []);
      failures.push({ id: bead.id, error: message });
    }
  }

  await saveLocalFavorites(context, localFavorites);
  await provider.refresh();

  if (failures.length === 0) {
    if (toggledOn || toggledOff) {
      if (toggledOn && toggledOff) {
        void vscode.window.showInformationMessage(
          t('Updated favorites: {0} added, {1} removed.', toggledOn, toggledOff)
        );
      } else if (toggledOn) {
        void vscode.window.showInformationMessage(t('Marked {0} bead(s) as favorite', toggledOn));
      } else {
        void vscode.window.showInformationMessage(t('Removed favorite from {0} bead(s)', toggledOff));
      }
    }
    return;
  }

  const failureList = failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ');
  if (successes.length === 0) {
    void vscode.window.showErrorMessage(
      t('Failed to update favorites for {0} bead(s): {1}', failures.length, failureList)
    );
  } else {
    void vscode.window.showWarningMessage(
      t('Updated {0} bead(s); failed for {1}: {2}', successes.length, failures.length, failureList)
    );
  }
}

function collectSelectedBeads(
  provider: BeadsTreeDataProvider,
  treeView: vscode.TreeView<TreeItemType>,
  activityFeedView?: vscode.TreeView<vscode.TreeItem>
): BeadItemData[] {
  const treeSelections = treeView.selection
    .filter((item): item is BeadTreeItem => item instanceof BeadTreeItem)
    .map((item) => item.bead);

  const feedSelections = activityFeedView?.selection
    .filter((item): item is ActivityEventItem => item instanceof ActivityEventItem)
    .map((item) => item.event.issueId)
    .filter(Boolean) ?? [];

  const providerItems = (provider as any).items as BeadItemData[];
  const feedBeads = feedSelections
    .map((id) => providerItems.find((b) => b.id === id))
    .filter((b): b is BeadItemData => Boolean(b));

  const combined = [...treeSelections, ...feedBeads];
  const seen = new Set<string>();
  return combined.filter((b) => {
    if (seen.has(b.id)) {
      return false;
    }
    seen.add(b.id);
    return true;
  });
}

async function restoreFocus(treeView: vscode.TreeView<TreeItemType>, provider: BeadsTreeDataProvider, beadId: string): Promise<void> {
  if (!treeView) {
    return;
  }
  try {
    const element = await provider.findTreeItemById(beadId);
    if (element) {
      await treeView.reveal(element, { select: true, focus: true });
    }
  } catch (error) {
    console.warn('[InlineEdit] Failed to restore selection', error);
  }
}

async function inlineEditTitle(provider: BeadsTreeDataProvider, treeView: vscode.TreeView<TreeItemType>): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);
  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to rename items inline.')
    );
    return;
  }

  const beads = collectSelectedBeads(provider, treeView);
  if (!beads || beads.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to rename.'));
    return;
  }

  const bead = beads[0];
  const newTitle = await vscode.window.showInputBox({
    prompt: t('Enter a new title'),
    value: bead.title,
    ignoreFocusOut: true,
  });

  if (newTitle === undefined || newTitle.trim() === '' || newTitle.trim() === bead.title) {
    return;
  }

  await provider.updateTitle(bead, newTitle.trim());
  await restoreFocus(treeView, provider, bead.id);
}

async function inlineEditLabels(provider: BeadsTreeDataProvider, treeView: vscode.TreeView<TreeItemType>): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);
  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to edit labels inline.')
    );
    return;
  }

  const beads = collectSelectedBeads(provider, treeView);
  if (!beads || beads.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to edit labels.'));
    return;
  }

  const bead = beads[0];
  const raw = bead.raw as any;
  const labels = Array.isArray(raw?.labels) ? raw.labels.map((l: any) => String(l)) : bead.tags ?? [];
  const action = await vscode.window.showQuickPick(
    [
      { label: t('Add label'), value: 'add' },
      { label: t('Remove label'), value: 'remove', description: labels.length === 0 ? t('No labels to remove') : undefined, alwaysShow: true }
    ],
    { placeHolder: t('Edit labels'), canPickMany: false }
  );

  if (!action) {
    return;
  }

  if (action.value === 'add') {
    const label = await vscode.window.showInputBox({
      prompt: t('Enter a label to add'),
      ignoreFocusOut: true,
    });
  if (!label || label.trim() === '') {
    return;
  }
    await provider.addLabel(bead, label.trim());
    await restoreFocus(treeView, provider, bead.id);
    return;
  }

  if (labels.length === 0) {
    void vscode.window.showWarningMessage(t('This bead has no labels to remove.'));
    return;
  }

  const labelPick = await vscode.window.showQuickPick<{ label: string }>(labels.map((l: string) => ({ label: l })), {
    placeHolder: t('Select a label to remove'),
    canPickMany: false,
  });

  if (!labelPick) {
    return;
  }

  await provider.removeLabel(bead, labelPick.label);
  await restoreFocus(treeView, provider, bead.id);
}

async function inlineStatusQuickChange(
  provider: BeadsTreeDataProvider,
  treeView: vscode.TreeView<TreeItemType>,
  activityFeedView?: vscode.TreeView<vscode.TreeItem>,
  targetItem?: BeadItemData
): Promise<void> {
  const config = vscode.workspace.getConfiguration('beady');
  const featureEnabled = config.get<boolean>('inlineStatusChange.enabled', false);

  if (!featureEnabled) {
    void vscode.window.showInformationMessage(
      t('Enable the "beady.inlineStatusChange.enabled" setting to change status inline.')
    );
    return;
  }

  const beads = targetItem ? [targetItem] : collectSelectedBeads(provider, treeView, activityFeedView);
  if (!beads || beads.length === 0) {
    void vscode.window.showWarningMessage(t('No beads selected. Select one or more items to change status.'));
    return;
  }

  const statusLabels = getStatusLabels();
  const statusPick = await vscode.window.showQuickPick(
    [
      { label: statusLabels.open, description: 'open', value: 'open' },
      { label: statusLabels.in_progress, description: 'in_progress', value: 'in_progress' },
      { label: statusLabels.blocked, description: 'blocked', value: 'blocked' },
      { label: statusLabels.closed, description: 'closed', value: 'closed' },
    ],
    {
      placeHolder: t('Select a new status to apply'),
      ignoreFocusOut: true,
    }
  );

  if (!statusPick) {
    return;
  }

  const targetStatus = statusPick.value;
  const projectRoot = resolveProjectRoot(config);

  if (!projectRoot) {
    void vscode.window.showErrorMessage(PROJECT_ROOT_ERROR);
    return;
  }

  const transitionable = beads.filter((bead) => validateStatusChange(bead.status, targetStatus).allowed);
  const skipped = beads.filter((bead) => !validateStatusChange(bead.status, targetStatus).allowed).map((bead) => bead.id);

  if (transitionable.length === 0) {
    void vscode.window.showWarningMessage(t('All selected items are already in status {0}.', formatStatusLabel(targetStatus)));
    return;
  }

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('Updating status for {0} item(s)...', transitionable.length),
      cancellable: false,
    },
    async (progress) => {
      return executeBulkStatusUpdate(
        transitionable.map((bead) => bead.id),
        targetStatus,
        async (id) => {
          await runBdCommand(['update', id, '--status', targetStatus], projectRoot);
        },
        (completed, total) => {
          progress.report({ message: t('{0}/{1} updated', completed, total) });
        }
      );
    }
  );

  await provider.refresh();

  if (summary.successes.length > 0) {
    void vscode.window.showInformationMessage(
      t('Updated status for {0} item(s)', summary.successes.length)
    );
  }

  if (skipped.length > 0) {
    void vscode.window.showWarningMessage(
      t('Skipped {0} item(s) already in that status: {1}', skipped.length, skipped.join(', '))
    );
  }

  if (summary.failures.length > 0) {
    const failureList = summary.failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ');
    void vscode.window.showErrorMessage(
      t('Failed to update {0} item(s): {1}', summary.failures.length, failureList)
    );
  }
}

async function editAssignee(
  provider: BeadsTreeDataProvider,
  treeView?: vscode.TreeView<TreeItemType>,
  bead?: BeadItemData
): Promise<void> {
  const selected = bead ? [bead] : treeView ? collectSelectedBeads(provider, treeView) : [];

  if (!selected || selected.length !== 1) {
    void vscode.window.showWarningMessage(t('Select exactly one bead to edit the assignee.'));
    return;
  }

  const target = selected[0];
  const currentAssignee = sanitizeInlineText(deriveAssigneeName(target, ''));
  const placeholder = t('Name or handle (blank to clear)');

  const input = await vscode.window.showInputBox({
    prompt: t('Set or clear the assignee'),
    placeHolder: placeholder,
    value: currentAssignee,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const result = validateAssigneeInput(value);
      return result.valid ? undefined : validationMessage('assignee', result.reason);
    },
  });

  if (input === undefined) {
    return;
  }

  const validation = validateAssigneeInput(input);
  if (!validation.valid) {
    void vscode.window.showWarningMessage(validationMessage('assignee', validation.reason));
    return;
  }

  await provider.updateAssignee(target, validation.value ?? '');

  if (treeView) {
    await restoreFocus(treeView, provider, target.id);
  }
}

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
    providerRef = new BeadsTreeDataProvider(context, watchManager);
    if (!providerRef) {
      throw new Error('Beads tree provider failed to initialize');
    }
    const provider = providerRef;
  const treeView = vscode.window.createTreeView('beadyExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    canSelectMany: true,
  });

  const webviewProvider = new BeadsWebviewProvider(context.extensionUri, provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BeadsWebviewProvider.viewType, webviewProvider)
  );

  // Set tree view reference for badge updates
  provider.setTreeView(treeView);

  const dependencyTreeProvider = new DependencyTreeProvider(() => provider['items'] as BeadItemData[] | undefined);
  const dependencyTreeView = vscode.window.createTreeView('beadyDependencyTree', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true,
  });
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

  const applyWorkspaceContext = (): void => {
    const count = vscode.workspace.workspaceFolders?.length ?? 0;
    const options = getWorkspaceOptions(vscode.workspace.workspaceFolders);
    const active = options.find((opt) => opt.id === provider.getActiveWorkspaceId()) ?? options[0];
    void vscode.commands.executeCommand('setContext', 'beady.multiRootAvailable', count > 1);
    void vscode.commands.executeCommand('setContext', 'beady.activeWorkspaceLabel', active?.label ?? '');
  };

  const applyBulkActionsContext = (): void => {
    const bulkConfig = getBulkActionsConfig();
    void vscode.commands.executeCommand('setContext', 'beady.bulkActionsEnabled', bulkConfig.enabled);
    void vscode.commands.executeCommand('setContext', 'beady.bulkActionsMaxSelection', bulkConfig.maxSelection);
  };

  const applyQuickFiltersContext = (): void => {
    const quickFiltersEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('quickFilters.enabled', false);
    void vscode.commands.executeCommand('setContext', 'beady.quickFiltersEnabled', quickFiltersEnabled);
    provider.syncQuickFilterContext();
  };

  const applySortPickerContext = (): void => {
    const enabled = vscode.workspace.getConfiguration('beady').get<boolean>('sortPicker.enabled', true);
    provider.setSortPickerEnabled(enabled);
    void vscode.commands.executeCommand('setContext', 'beady.sortPickerEnabled', enabled);
  };

  const applyFavoritesContext = (): void => {
    const favoritesEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('favorites.enabled', false);
    void vscode.commands.executeCommand('setContext', 'beady.favoritesEnabled', favoritesEnabled);
  };

  const applyFeedbackContext = (): void => {
    const enablement = computeFeedbackEnablement();
    provider.setFeedbackEnabled(enablement.enabled);
    void vscode.commands.executeCommand('setContext', 'beady.feedbackEnabled', enablement.enabled);
  };

  applyWorkspaceContext();
  applyBulkActionsContext();
  applyQuickFiltersContext();
  applySortPickerContext();
  applyFavoritesContext();
  applyFeedbackContext();

  // Register provider disposal
  context.subscriptions.push({ dispose: () => provider.dispose() });

  // Activity Feed Provider
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
  context.subscriptions.push({ dispose: () => activityFeedProvider.dispose() });

  const openActivityFeedEvent = async (issueId?: string): Promise<void> => {
    const selectedId =
      issueId ||
      activityFeedView.selection.find(
        (item): item is ActivityEventItem => item instanceof ActivityEventItem
      )?.event.issueId;

    if (!selectedId) {
      return;
    }

    await openBeadFromFeed(selectedId, provider);
  };

  // Register commands via command registry
  const commandRegistry = new CommandRegistry();
  commandRegistry.registerAll(createQuickFilterCommands(provider));
  commandRegistry.registerAll(createExportCommands(provider, treeView));
  context.subscriptions.push(...commandRegistry.getDisposables());

  // Register Chat Participants
  registerChatParticipants(context);

  context.subscriptions.push(
    treeView,
    dependencyTreeView,
    rowExpandOnSelect,
    dependencySelection,
    dependencySync,
    expandListener,
    collapseListener,
    activityFeedView,
    activityFeedStatus,
    vscode.commands.registerCommand('beady.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beady.search', () => provider.search()),
    vscode.commands.registerCommand('beady.clearSearch', () => provider.clearSearch()),
    vscode.commands.registerCommand('beady.clearSortOrder', () => provider.clearSortOrder()),
    // Quick filter commands now registered via commandRegistry above
    vscode.commands.registerCommand('beady.toggleClosedVisibility', () => provider.toggleClosedVisibility()),
    vscode.commands.registerCommand('beady.openBead', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      if (resolved) {
        return openBead(resolved, provider);
      }
    }),
    vscode.commands.registerCommand('beady.createBead', () => createBead()),
    vscode.commands.registerCommand('beady.selectWorkspace', () => selectWorkspace(provider)),
    vscode.commands.registerCommand('beady.addDependency', (item?: BeadItemData) => addDependencyCommand(provider, item)),
    vscode.commands.registerCommand('beady.removeDependency', (item?: BeadItemData) => removeDependencyCommand(provider, undefined, { contextId: item?.id })),
    vscode.commands.registerCommand('beady.dependencyTree.pickRoot', async () => {
      const root = await pickBeadQuick(provider['items'] as BeadItemData[] | undefined, t('Select issue for dependency tree'));
      if (root) {
        dependencyTreeProvider.setRoot(root.id);
      }
    }),
    vscode.commands.registerCommand('beady.dependencyTree.addUpstream', async () => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
        return;
      }
      const rootId = dependencyTreeProvider.getRootId();
      const items = provider['items'] as BeadItemData[] | undefined;
      const root = items?.find((i) => i.id === rootId);
      if (!root) {
        void vscode.window.showWarningMessage(t('Select an issue to edit dependencies.'));
        return;
      }
      const target = await pickBeadQuick(items, t('Select an upstream dependency'), root.id);
      if (!target) {
        return;
      }
      await addDependencyCommand(provider, root, { sourceId: root.id, targetId: target.id });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.dependencyTree.addDownstream', async () => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to add dependencies.'));
        return;
      }
      const rootId = dependencyTreeProvider.getRootId();
      const items = provider['items'] as BeadItemData[] | undefined;
      const root = items?.find((i) => i.id === rootId);
      if (!root) {
        void vscode.window.showWarningMessage(t('Select an issue to edit dependencies.'));
        return;
      }
      const dependent = await pickBeadQuick(items, t('Select an issue that should depend on {0}', root.id), root.id);
      if (!dependent) {
        return;
      }
      await addDependencyCommand(provider, dependent, { sourceId: dependent.id, targetId: root.id });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.dependencyTree.remove', async (node?: any) => {
      const editingEnabled = vscode.workspace.getConfiguration('beady').get<boolean>('enableDependencyEditing', false);
      if (!editingEnabled) {
        void vscode.window.showWarningMessage(t('Enable dependency editing in settings to remove dependencies.'));
        return;
      }
      if (!node || !node.sourceId || !node.targetId) {
        return;
      }
      await removeDependencyCommand(provider, { sourceId: node.sourceId, targetId: node.targetId }, { contextId: dependencyTreeProvider.getRootId() });
      dependencyTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('beady.visualizeDependencies', () => visualizeDependencies(provider)),
    // Export commands now registered via commandRegistry above
    vscode.commands.registerCommand('beady.bulkUpdateStatus', () => bulkUpdateStatus(provider, treeView)),
    vscode.commands.registerCommand('beady.bulkAddLabel', () => bulkUpdateLabel(provider, treeView, 'add')),
    vscode.commands.registerCommand('beady.bulkRemoveLabel', () => bulkUpdateLabel(provider, treeView, 'remove')),
    vscode.commands.registerCommand('beady.toggleFavorite', () => toggleFavorites(provider, treeView, context)),
    vscode.commands.registerCommand('beady.inlineStatusChange', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      if (resolved) {
        return inlineStatusQuickChange(provider, treeView, activityFeedView, resolved);
      }
      return inlineStatusQuickChange(provider, treeView, activityFeedView);
    }),
    vscode.commands.registerCommand('beady.inlineEditTitle', () => inlineEditTitle(provider, treeView)),
    vscode.commands.registerCommand('beady.inlineEditLabels', () => inlineEditLabels(provider, treeView)),
    vscode.commands.registerCommand('beady.editAssignee', (item: any) => {
      const resolved = resolveCommandItem(item, provider);
      return editAssignee(provider, treeView, resolved);
    }),
    
    // Activity Feed commands
    vscode.commands.registerCommand('beady.refreshActivityFeed', () => activityFeedProvider.refresh('manual')),
    vscode.commands.registerCommand('beady.filterActivityFeed', async () => {
      const options: Array<vscode.QuickPickItem & { value: string }> = [
        { label: t('All Events'), description: t('Show all event types'), value: 'all' },
        { label: t('Created'), description: t('Show issue creation events'), value: 'created' },
        { label: t('Closed'), description: t('Show issue closed events'), value: 'closed' },
        { label: t('Status Changes'), description: t('Show status change events'), value: 'status' },
        { label: t('Dependencies'), description: t('Show dependency events'), value: 'dependencies' },
        { label: t('Today'), description: t('Show events from today'), value: 'today' },
        { label: t('This Week'), description: t('Show events from this week'), value: 'week' },
        { label: t('This Month'), description: t('Show events from this month'), value: 'month' },
      ];

      const selection = await vscode.window.showQuickPick(options, {
        placeHolder: t('Filter activity feed by...'),
      });

      if (!selection) {
        return;
      }

      switch (selection.value) {
        case 'all':
          activityFeedProvider.clearFilters();
          break;
        case 'created':
          activityFeedProvider.setEventTypeFilter(['created'] as EventType[]);
          break;
        case 'closed':
          activityFeedProvider.setEventTypeFilter(['closed'] as EventType[]);
          break;
        case 'status':
          activityFeedProvider.setEventTypeFilter(['status_changed'] as EventType[]);
          break;
        case 'dependencies':
          activityFeedProvider.setEventTypeFilter(['dependency_added', 'dependency_removed'] as EventType[]);
          break;
        case 'today':
          activityFeedProvider.setTimeRangeFilter('today');
          break;
        case 'week':
          activityFeedProvider.setTimeRangeFilter('week');
          break;
        case 'month':
          activityFeedProvider.setTimeRangeFilter('month');
          break;
      }
    }),
    vscode.commands.registerCommand('beady.clearActivityFeedFilter', () => {
      activityFeedProvider.clearFilters();
      void vscode.window.showInformationMessage(t('Activity feed filter cleared'));
    }),
    vscode.commands.registerCommand('beady.activityFeed.openEvent', (issueId?: string) => openActivityFeedEvent(issueId)),
    vscode.commands.registerCommand('beady.activityFeed.openSelected', () => openActivityFeedEvent()),
    vscode.commands.registerCommand('beady.openActivityFeedPanel', () => 
      openActivityFeedPanel(activityFeedProvider, provider)
    ),
    vscode.commands.registerCommand('beady.openInProgressPanel', () => openInProgressPanel(provider)),

    vscode.commands.registerCommand('beady.editExternalReference', async (item: BeadItemData) => {
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
        prompt: t('Set the external reference for this bead (format: ID:description)'),
        value: currentValue,
        placeHolder: t('Enter "ID:description" or leave empty to remove'),
      });

      if (newValue === undefined) {
        return;
      }

      await provider.updateExternalReference(item, newValue.trim().length > 0 ? newValue.trim() : undefined);
    }),
    vscode.commands.registerCommand('beady.deleteBeads', async () => {
      // Get selected items from tree view
      const selection = treeView.selection;

      if (!selection || selection.length === 0) {
        void vscode.window.showWarningMessage(t('No beads selected'));
        return;
      }
      
      // Filter for BeadTreeItems only (not StatusSectionItems)
      const beadItems = selection.filter((item): item is BeadTreeItem => item instanceof BeadTreeItem);
      if (beadItems.length === 0) {
        void vscode.window.showWarningMessage(t('No beads selected (only status sections selected)'));
        return;
      }

      // Build confirmation message with list of beads
      const beadsList = beadItems
        .map(item => `  • ${item.bead.id} - ${item.bead.title}`)
        .join('\n');

      const message = beadItems.length === 1
        ? t('Are you sure you want to delete this bead?\n\n{0}', beadsList)
        : t('Are you sure you want to delete these {0} beads?\n\n{1}', beadItems.length, beadsList);

      const deleteLabel = t('Delete');

      // Show confirmation dialog
      const answer = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        deleteLabel
      );

      if (answer !== deleteLabel) {
        return;
      }

      // Delete each bead
      const config = vscode.workspace.getConfiguration('beady');
      const projectRoot = resolveProjectRoot(config) || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());

      try {
        // Delete beads one by one with guard
        for (const item of beadItems) {
          await runBdCommand(['delete', item.bead.id, '--force'], projectRoot!);
        }

        await provider.refresh();

        const successMessage = beadItems.length === 1
          ? t('Deleted bead: {0}', beadItems[0].bead.id)
          : t('Deleted {0} beads', beadItems.length);
        void vscode.window.showInformationMessage(successMessage);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(t('Failed to delete beads: {0}', errorMessage));
      }
    }),
    registerSendFeedbackCommand(context),
  );

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
      applyQuickFiltersContext();
    }

    if (event.affectsConfiguration('beady.sortPicker')) {
      applySortPickerContext();
    }

    if (event.affectsConfiguration('beady.feedback') || event.affectsConfiguration('beady.projectRoot')) {
      applyFeedbackContext();
    }
  });

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    applyFeedbackContext();
    applyBulkActionsContext();
    applyQuickFiltersContext();
    applyWorkspaceContext();
    provider.handleWorkspaceFoldersChanged();
  });

  context.subscriptions.push(configurationWatcher, workspaceWatcher);

  void provider.refresh();
  } catch (error) {
    activationError = error;
    console.error('[beads] activation failed', error);
    showActivationError(undefined, error);
  }

  registerSortCommand('beady.pickSortMode', (p) => p.pickSortMode());
  registerSortCommand('beady.toggleSortMode', (p) => p.toggleSortMode());
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
  collectDependencyEdges,
  addDependencyCommand,
  inlineStatusQuickChange,
  inlineEditTitle,
  inlineEditLabels,
  deriveAssigneeName,
  bulkUpdateStatus,
  bulkUpdateLabel,
};
