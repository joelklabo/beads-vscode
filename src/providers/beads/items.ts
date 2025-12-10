import * as vscode from 'vscode';
import { BeadItemData, buildPreviewSnippet, formatRelativeTime, getStaleInfo, isStale, sanitizeTooltipText, stripBeadIdPrefix, formatStatusLabel, sanitizeInlineText } from '../../utils';
import { getIssueTypeIcon, getPriorityIcon, getStatusIcon } from '../../views/shared/icons';
import { DensityMode } from '../../utils/density';

const t = vscode.l10n.t;

const ASSIGNEE_COLORS: Array<{ colorId: string; name: string; dot: string }> = [
  { colorId: 'charts.blue', name: t('Blue'), dot: '🔵' },
  { colorId: 'charts.green', name: t('Green'), dot: '🟢' },
  { colorId: 'charts.purple', name: t('Purple'), dot: '🟣' },
  { colorId: 'charts.orange', name: t('Orange'), dot: '🟠' },
  { colorId: 'charts.red', name: t('Red'), dot: '🔴' },
  { colorId: 'charts.yellow', name: t('Yellow'), dot: '🟡' },
  { colorId: 'foreground', name: t('Neutral'), dot: '⚫' },
  { colorId: 'foreground', name: t('Unassigned'), dot: '⚪' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getAssigneeInfo(bead: BeadItemData): { name: string; display: string; dot: string; colorName: string; colorId: string } {
  const fallback = t('Unassigned');
  const raw = (bead.assignee ?? '').trim();
  const safe = sanitizeInlineText(raw);
  const name = safe && safe.length > 0 ? safe : fallback;
  const truncated = name.length > 18 ? `${name.slice(0, 17)}…` : name;

  if (!safe || safe.length === 0) {
    const neutral = ASSIGNEE_COLORS[ASSIGNEE_COLORS.length - 1];
    return { name, display: truncated, dot: neutral.dot, colorName: neutral.name, colorId: neutral.colorId };
  }

  const colorIndex = hashString(name.toLowerCase()) % ASSIGNEE_COLORS.length;
  const paletteEntry = ASSIGNEE_COLORS[colorIndex] ?? ASSIGNEE_COLORS[ASSIGNEE_COLORS.length - 1];
  const dot = paletteEntry.dot;
  const colorName = paletteEntry.name;

  return { name, display: truncated, dot, colorName, colorId: paletteEntry.colorId };
}

export class SummaryHeaderItem extends vscode.TreeItem {
  constructor(label: string, description?: string, tooltip?: string, accessibilityLabel?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'summaryHeader';
    this.description = description;
    this.tooltip = tooltip ?? description ?? label;
    this.iconPath = new vscode.ThemeIcon('info');
    const ariaLabel = accessibilityLabel || (description ? `${label}: ${description}` : label);
    this.accessibilityInformation = { label: ariaLabel, role: 'text' };
  }
}

export class StatusSectionItem extends vscode.TreeItem {
  constructor(public readonly status: string, public readonly beads: BeadItemData[], isCollapsed: boolean = false) {
    const statusDisplay = status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const chevron = isCollapsed ? '$(chevron-right)' : '$(chevron-down)';
    const labelWithChevron = `${chevron} ${statusDisplay}`;
    super(labelWithChevron, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'statusSection';
    this.label = labelWithChevron;
    this.description = `${beads.length}`;
    const iconConfig: Record<string, { icon: string; color: string }> = {
      open: { icon: getStatusIcon('open'), color: 'charts.blue' },
      in_progress: { icon: getStatusIcon('in_progress'), color: 'charts.yellow' },
      blocked: { icon: getStatusIcon('blocked'), color: 'errorForeground' },
      closed: { icon: getStatusIcon('closed'), color: 'testing.iconPassed' },
    };
    const config = iconConfig[status] || { icon: 'folder', color: 'foreground' };
    this.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
    this.tooltip = `${statusDisplay}: ${beads.length} issue${beads.length !== 1 ? 's' : ''}`;
  }
}

export class WarningSectionItem extends vscode.TreeItem {
  constructor(public readonly beads: BeadItemData[], public readonly thresholdMinutes: number, isCollapsed: boolean = false) {
    super('⚠️ Stale Tasks', isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'warningSection';
    this.description = `${beads.length}`;
    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
    const tooltip = new vscode.MarkdownString();
    const emptyEpicCount = beads.filter((b) => b.issueType === 'epic').length;
    const staleCount = beads.length - emptyEpicCount;
    tooltip.appendMarkdown(`**Warnings:** ${beads.length} item${beads.length !== 1 ? 's' : ''}\n\n`);
    if (staleCount > 0) {
      tooltip.appendMarkdown(`Stale tasks in progress > ${thresholdMinutes} min: ${staleCount}\n\n`);
    }
    if (emptyEpicCount > 0) {
      tooltip.appendMarkdown(`Empty epics (no children): ${emptyEpicCount}\n\n`);
    }
    tooltip.appendMarkdown('Review these items to keep work flowing.');
    this.tooltip = tooltip;
  }
}

export class EpicStatusSectionItem extends vscode.TreeItem {
  constructor(public readonly status: string, public readonly epics: EpicTreeItem[], isCollapsed: boolean = false) {
    const statusDisplay = status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    super(statusDisplay, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'epicStatusSection';
    this.label = statusDisplay;
    this.description = `${epics.length}`;
    const iconConfig: Record<string, { icon: string; color: string }> = {
      open: { icon: getStatusIcon('open'), color: 'charts.blue' },
      in_progress: { icon: getStatusIcon('in_progress'), color: 'charts.yellow' },
      blocked: { icon: getStatusIcon('blocked'), color: 'errorForeground' },
      closed: { icon: getStatusIcon('closed'), color: 'testing.iconPassed' },
    };
    const config = iconConfig[status] || { icon: 'folder', color: 'foreground' };
    this.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
    this.tooltip = `${statusDisplay}: ${epics.length} epic${epics.length !== 1 ? 's' : ''}`;
  }
}

export class EpicTreeItem extends vscode.TreeItem {
  constructor(public readonly epic: BeadItemData | null, public readonly children: BeadItemData[], isCollapsed: boolean = false) {
    const label = epic?.title || epic?.id || 'Epic';
    super(label, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = epic ? 'epicItem' : 'epic';
    const idPart = epic?.id ? `${epic.id} · ` : '';
    this.description = `${idPart}${children.length} item${children.length !== 1 ? 's' : ''}`;
    this.setEpicIcon(epic?.status, isCollapsed);
    this.tooltip = epic ? `${epic.title || epic.id} (${children.length} items)` : undefined;
  }

  updateIcon(isCollapsed: boolean): void {
    this.setEpicIcon(this.epic?.status, isCollapsed);
  }

  private setEpicIcon(status: string | undefined, isCollapsed: boolean): void {
    const statusColors: Record<string, string> = {
      open: 'charts.blue',
      in_progress: 'charts.yellow',
      blocked: 'errorForeground',
      closed: 'testing.iconPassed',
    };
    const iconColor = statusColors[status || 'open'] || 'charts.blue';
    const iconName = isCollapsed ? 'folder-library' : 'folder-opened';
    this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
  }
}

export class UngroupedSectionItem extends vscode.TreeItem {
  constructor(public readonly children: BeadItemData[], isCollapsed: boolean = false) {
    super('Ungrouped', isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'ungroupedSection';
    this.label = t('Ungrouped');
    this.description = `${children.length} item${children.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('inbox', new vscode.ThemeColor('charts.blue'));
    this.tooltip = `Items without a parent epic: ${children.length}`;
  }
}

export class AssigneeSectionItem extends vscode.TreeItem {
  constructor(
    public readonly assignee: string,
    public readonly beads: BeadItemData[],
    public readonly dot: string,
    public readonly colorName: string,
    public readonly colorId: string,
    isCollapsed: boolean = false,
    public readonly key: string,
  ) {
    const safeLabel = sanitizeInlineText(assignee) || t('Unassigned');
    super(`${dot} ${safeLabel}`, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'assigneeSection';
    this.label = `${dot} ${safeLabel}`;
    this.description = `${beads.length}`;
    this.tooltip = `${safeLabel}: ${beads.length} item${beads.length !== 1 ? 's' : ''}`;
    const label = safeLabel;
    const countLabel = t('{0} item{1}', beads.length, beads.length === 1 ? '' : 's');
    this.accessibilityInformation = {
      label: t('Assignee {0} — {1}. Color: {2}.', label, countLabel, colorName),
    };
    this.iconPath = new vscode.ThemeIcon('account', new vscode.ThemeColor(colorId));
  }
}

export class BeadDetailItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'beadDetail';
    this.iconPath = new vscode.ThemeIcon('circle-small');
    this.description = description;
    this.tooltip = description ? `${label}: ${description}` : label;
  }
}

export class BeadTreeItem extends vscode.TreeItem {
  private readonly detailItems: BeadDetailItem[];

  constructor(public readonly bead: BeadItemData, expanded: boolean = false, private readonly worktreeId?: string, density: DensityMode = "default") {
    const cleanTitle = stripBeadIdPrefix(bead.title || bead.id, bead.id);
    const rawLabel = cleanTitle || bead.title || bead.id;
    const label = sanitizeInlineText(rawLabel) || rawLabel;
    super(label, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);

    const config = vscode.workspace.getConfiguration('beady');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    const staleInfo = getStaleInfo(bead);
    const isTaskStale = isStale(bead, thresholdHours);

    const assigneeInfo = getAssigneeInfo(bead);
    const safeAssigneeDisplay = sanitizeInlineText(assigneeInfo.display) || t('Unassigned');
    const safeAssigneeName = sanitizeInlineText(assigneeInfo.name) || t('Unassigned');
    const safeAssigneeColor = sanitizeInlineText(assigneeInfo.colorName);
    const safeId = sanitizeInlineText(bead.id) || bead.id;

    const status = bead.status || 'open';
    const priorityValue = (bead as any).priority ?? 2;
    const priorityIcon = getPriorityIcon(priorityValue);
    const statusIcon = getStatusIcon(status);
    const typeIcon = getIssueTypeIcon(bead.issueType || 'task');

    const relTime = bead.updatedAt ? formatRelativeTime(bead.updatedAt) : undefined;

    const descParts: string[] = [
      safeId,
      `$(${statusIcon}) ${formatStatusLabel(status)}`,
      `$(${priorityIcon}) P${priorityValue}`,
      `${assigneeInfo.dot} $(person) ${safeAssigneeDisplay}`,
    ];
    if (relTime) {
      descParts.push(`$(history) ${relTime}`);
    }
    if (isTaskStale && staleInfo) {
      descParts.push(`⚠️ ${staleInfo.formattedTime}`);
    }

    this.description = descParts.join(' · ');
    this.contextValue = 'bead';

    const statusColors: Record<string, string> = {
      open: 'charts.blue',
      in_progress: isTaskStale ? 'charts.orange' : 'charts.yellow',
      blocked: 'errorForeground',
      closed: 'testing.iconPassed',
    };

    const iconName = bead.status === 'closed' ? 'pass' : typeIcon;
    const iconColor = statusColors[bead.status || 'open'] || 'charts.blue';
    const themeIcon = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
    this.iconPath = (themeIcon || { id: iconName }) as any;

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = false;
    tooltip.supportHtml = false;

    const safeTitle = sanitizeTooltipText(bead.title || bead.id);
    const safeIdTooltip = sanitizeTooltipText(bead.id);
    const safeDescription = bead.description ? sanitizeTooltipText(bead.description) : undefined;
    const safeWorktree = this.worktreeId ? sanitizeTooltipText(this.worktreeId) : undefined;

    tooltip.appendMarkdown(`**${safeTitle}**\n\n`);
    tooltip.appendMarkdown(`🆔 ${safeIdTooltip}\n\n`);
    tooltip.appendMarkdown(`👤 ${sanitizeTooltipText(assigneeInfo.name || t('Unassigned'))}\n\n`);

    if (safeDescription) {
      tooltip.appendMarkdown(`${safeDescription}\n\n`);
    }

    if (safeWorktree) {
      tooltip.appendMarkdown(`🏷️ Worktree: ${safeWorktree}\n\n`);
    }

    if (bead.status) {
      tooltip.appendMarkdown(`📌 Status: ${sanitizeTooltipText(bead.status)}\n\n`);
    }

    if (bead.tags && bead.tags.length > 0) {
      tooltip.appendMarkdown(`🏷️ Tags: ${sanitizeTooltipText(bead.tags.join(', '))}\n\n`);
    }

    this.tooltip = tooltip;

    const preview = buildPreviewSnippet(bead.description, 80);
    const safePreview = sanitizeInlineText(preview);
    if (safePreview && density !== 'compact') {
      const previewSnippet = truncate(safePreview, 80);
      this.description = `${this.description} · ${previewSnippet}`;
    }
    const labels = (bead.tags && bead.tags.length > 0) ? sanitizeInlineText(bead.tags.join(', ')) : t('None');
    const priority = (bead as any).priority !== undefined && (bead as any).priority !== null ? String((bead as any).priority) : t('Unset');

    this.detailItems = [
      new BeadDetailItem(`${assigneeInfo.dot} ${safeAssigneeName}`, t('Status: {0}', formatStatusLabel(bead.status || 'open'))),
      new BeadDetailItem(t('Labels'), truncate(labels, 80)),
      new BeadDetailItem(t('Priority'), priority),
      new BeadDetailItem(t('Updated'), relTime ?? t('Unknown')),
    ];

    if (bead.blockingDepsCount && bead.blockingDepsCount > 0) {
      this.detailItems.push(new BeadDetailItem(t('Blockers'), t('{0} blocking issue(s)', bead.blockingDepsCount)));
    }

    if (safePreview) {
      this.detailItems.push(new BeadDetailItem(t('Summary'), truncate(safePreview, 120)));
    }

    const ariaParts = [
      sanitizeInlineText(rawLabel) || rawLabel,
      t('ID {0}', safeId),
      t('Assignee {0} ({1})', safeAssigneeName, safeAssigneeColor),
      t('Status {0}', formatStatusLabel(bead.status || 'open')),
    ];
    if (isTaskStale && staleInfo?.formattedTime) {
      ariaParts.push(t('Stale for {0}', staleInfo.formattedTime));
    }
    this.accessibilityInformation = { label: ariaParts.filter(Boolean).join(' • ') };

    this.command = {
      command: 'beady.openBead',
      title: 'Open Bead',
      arguments: [bead],
    };
  }

  getDetails(): BeadDetailItem[] {
    return this.detailItems;
  }
}

function truncate(value: string, maxLength: number): string {
  if (!value) {
    return '';
  }
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export type BeadsTreeItem = SummaryHeaderItem | StatusSectionItem | WarningSectionItem | EpicStatusSectionItem | AssigneeSectionItem | EpicTreeItem | UngroupedSectionItem | BeadTreeItem | BeadDetailItem;
