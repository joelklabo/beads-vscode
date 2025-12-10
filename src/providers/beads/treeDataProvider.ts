import * as vscode from 'vscode';
import {
  BeadItemData,
  formatError,
  formatSafeError,
  sanitizeErrorMessage,
  sanitizeInlineText,
  escapeHtml,
  isStale,
  validateDependencyAdd,
  sanitizeDependencyId,
  collectCliErrorOutput,
  validateStatusChange,
  formatStatusLabel,
  compareStatus,
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
  QuickFilterPreset,
  applyQuickFilter,
  toggleQuickFilter,
  normalizeQuickFilter,
  deriveAssigneeName,
} from '../../utils';
import { DensityMode, loadDensity, saveDensity } from '../../utils/density';
import { ActivityFeedTreeDataProvider, ActivityEventItem } from '../../activityFeedProvider';
import { EventType } from '../../activityFeed';
import { validateLittleGlenMessage, AllowedLittleGlenCommand } from '../../littleGlen/validation';
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
} from './items';
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
} from './store';
import { resolveProjectRoot, getWorkspaceOptions, findWorkspaceById, loadSavedWorkspaceSelection, saveWorkspaceSelection } from '../../utils/workspace';
import { computeFeedbackEnablement } from '../../feedback/enablement';
import { getBulkActionsConfig } from '../../utils/config';
import { registerSendFeedbackCommand } from '../../commands/sendFeedback';
import { CommandRegistry, createExportCommands, createQuickFilterCommands } from '../../commands';
import { DependencyTreeProvider } from '../../dependencyTreeProvider';
import { BeadsWebviewProvider } from './webview';
import { currentWorktreeId } from '../../worktree';
import { warnIfDependencyEditingUnsupported } from '../../services/runtimeEnvironment';
import { BdCommandOptions, formatBdError, resolveBeadId, runBdCommand } from '../../services/cliService';
import { registerChatParticipants } from '../../chatAgents';
import { getBeadDetailHtml } from '../../views/detail';
import { BeadDetailStrings, StatusLabelMap } from '../../views/detail/types';

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

export const STATUS_SECTION_ORDER: string[] = ['in_progress', 'open', 'blocked', 'closed'];
export const DEFAULT_COLLAPSED_SECTION_KEYS: string[] = [...STATUS_SECTION_ORDER, 'ungrouped'];
export type TreeItemType = SummaryHeaderItem | StatusSectionItem | WarningSectionItem | EpicStatusSectionItem | AssigneeSectionItem | EpicTreeItem | UngroupedSectionItem | BeadTreeItem | BeadDetailItem;

export const getStatusLabels = (): StatusLabelMap => ({
  open: t('Open'),
  in_progress: t('In Progress'),
  blocked: t('Blocked'),
  closed: t('Closed'),
});

export const buildBeadDetailStrings = (statusLabels: StatusLabelMap): BeadDetailStrings => ({
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

export class BeadsTreeDataProvider implements vscode.TreeDataProvider<TreeItemType>, vscode.TreeDragAndDropController<TreeItemType> {
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
  private density: DensityMode = "default";

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
    // Load density preference
    this.density = loadDensity(this.context);
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

  getDensity(): DensityMode {
    return this.density;
  }

  async setDensity(density: DensityMode): Promise<void> {
    this.density = density;
    await saveDensity(this.context, density);
    this.onDidChangeTreeDataEmitter.fire();
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
      const assigneeMeta = getAssigneeInfo(entry.beads[0] ?? { assignee: label } as any);
      const dot = assigneeMeta.dot || '⚪';
      return new AssigneeSectionItem(label, entry.beads, dot, assigneeMeta.colorName, assigneeMeta.colorId, collapsed, key);
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

  async updateDescription(item: BeadItemData, value: string): Promise<void> {
    await this.updateField(item, 'description', ['-d', value]);
  }

  async updateDesign(item: BeadItemData, value: string): Promise<void> {
    await this.updateField(item, 'design', ['--design', value]);
  }

  async updateAcceptanceCriteria(item: BeadItemData, value: string): Promise<void> {
    await this.updateField(item, 'acceptance criteria', ['--acceptance-criteria', value]);
  }

  async updateNotes(item: BeadItemData, value: string): Promise<void> {
    await this.updateField(item, 'notes', ['--notes', value]);
  }

  private async updateField(item: BeadItemData, fieldName: string, args: string[]): Promise<void> {
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
      await runBdCommand(['update', itemId, ...args], projectRoot);
      await this.refresh();
      // void vscode.window.showInformationMessage(t('Updated {0}', fieldName)); // Too noisy for auto-save
    } catch (error) {
      const message = formatSafeError(t('Failed to update {0}', fieldName), error, [projectRoot]);
      console.error(`Failed to update ${fieldName}`, message);
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

  async updateType(item: BeadItemData, type: string): Promise<void> {
    const validTypes = ['task', 'bug', 'feature', 'epic'];
    if (!validTypes.includes(type)) {
      void vscode.window.showWarningMessage(t('Invalid type. Must be one of: task, bug, feature, epic'));
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
      await runBdCommand(['update', itemId, '--type', type], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Updated type to: {0}', type));
    } catch (error) {
      const message = formatSafeError(t('Failed to update type'), error, [projectRoot]);
      console.error('Failed to update type', message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async updatePriority(item: BeadItemData, priority: number): Promise<void> {
    if (priority < 0 || priority > 4) {
      void vscode.window.showWarningMessage(t('Invalid priority. Must be 0-4'));
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
      await runBdCommand(['update', itemId, '--priority', priority.toString()], projectRoot);
      await this.refresh();
      void vscode.window.showInformationMessage(t('Updated priority to: P{0}', priority));
    } catch (error) {
      const message = formatSafeError(t('Failed to update priority'), error, [projectRoot]);
      console.error('Failed to update priority', message);
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
    const treeItem = new BeadTreeItem(item, isExpanded, undefined, this.density);
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

    if (element instanceof StatusSectionItem) {
      if (isCollapsed) {
        this.collapsedSections.add(element.status);
      } else {
        this.collapsedSections.delete(element.status);
      }
      this.saveCollapsedSections();
      element.applyCollapseState(isCollapsed);
      this.onDidChangeTreeDataEmitter.fire(element);
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
