import * as vscode from 'vscode';
import { BeadItemData, buildPreviewSnippet, formatRelativeTime, getStaleInfo, isStale, sanitizeTooltipText, stripBeadIdPrefix } from '../../utils';

const t = vscode.l10n.t;

const ASSIGNEE_COLOR_EMOJI = ['🔵', '🟢', '🟣', '🟠', '🔴', '🟡', '⚫', '⚪'];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getAssigneeInfo(bead: BeadItemData): { name: string; display: string; dot: string } {
  const fallback = t('Unassigned');
  const raw = (bead.assignee ?? '').trim();
  const name = raw.length > 0 ? raw : fallback;
  const truncated = name.length > 18 ? `${name.slice(0, 17)}…` : name;

  if (raw.length === 0) {
    return { name, display: truncated, dot: '⚪' };
  }

  const colorIndex = hashString(name.toLowerCase()) % ASSIGNEE_COLOR_EMOJI.length;
  const dot = ASSIGNEE_COLOR_EMOJI[colorIndex] ?? '⚪';

  return { name, display: truncated, dot };
}

export class StatusSectionItem extends vscode.TreeItem {
  constructor(public readonly status: string, public readonly beads: BeadItemData[], isCollapsed: boolean = false) {
    const statusDisplay = status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    super(statusDisplay, isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'statusSection';
    this.description = `${beads.length}`;
    const iconConfig: Record<string, { icon: string; color: string }> = {
      open: { icon: 'circle-outline', color: 'charts.blue' },
      in_progress: { icon: 'clock', color: 'charts.yellow' },
      blocked: { icon: 'error', color: 'errorForeground' },
      closed: { icon: 'pass', color: 'testing.iconPassed' },
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
    this.description = `${epics.length}`;
    const iconConfig: Record<string, { icon: string; color: string }> = {
      open: { icon: 'circle-outline', color: 'charts.blue' },
      in_progress: { icon: 'clock', color: 'charts.yellow' },
      blocked: { icon: 'error', color: 'errorForeground' },
      closed: { icon: 'pass', color: 'testing.iconPassed' },
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
    this.description = `${children.length} item${children.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('inbox', new vscode.ThemeColor('charts.blue'));
    this.tooltip = `Items without a parent epic: ${children.length}`;
  }
}

export class BeadTreeItem extends vscode.TreeItem {
  constructor(public readonly bead: BeadItemData, private readonly worktreeId?: string) {
    const cleanTitle = stripBeadIdPrefix(bead.title || bead.id, bead.id);
    const label = cleanTitle || bead.title || bead.id;
    super(label, vscode.TreeItemCollapsibleState.None);

    const config = vscode.workspace.getConfiguration('beads');
    const thresholdMinutes = config.get<number>('staleThresholdMinutes', 10);
    const thresholdHours = thresholdMinutes / 60;
    const staleInfo = getStaleInfo(bead);
    const isTaskStale = isStale(bead, thresholdHours);

    const assigneeInfo = getAssigneeInfo(bead);

    const descParts: string[] = [bead.id, `${assigneeInfo.dot} ${assigneeInfo.display}`];
    if (isTaskStale && staleInfo) {
      descParts.push(`⚠️ ${staleInfo.formattedTime}`);
    }

    const preview = buildPreviewSnippet(bead.description, 60);
    if (preview) {
      descParts.push(preview);
    }

    if (bead.updatedAt) {
      const relTime = formatRelativeTime(bead.updatedAt);
      if (relTime) {
        descParts.push(relTime);
      }
    }

    if (bead.blockingDepsCount && bead.blockingDepsCount > 0) {
      descParts.push(`⏳ ${bead.blockingDepsCount} blocker${bead.blockingDepsCount > 1 ? 's' : ''}`);
    }

    if (bead.tags && bead.tags.length > 0) {
      descParts.push(`[${bead.tags.join(', ')}]`);
    }

    if (bead.externalReferenceId) {
      const displayText = bead.externalReferenceDescription || bead.externalReferenceId;
      descParts.push(`Ext: ${displayText}`);
    }

    this.description = descParts.join(' · ');
    this.contextValue = 'bead';

    const typeIcons: Record<string, string> = {
      epic: 'rocket',
      task: 'tasklist',
      bug: 'bug',
      feature: 'sparkle',
      chore: 'wrench',
      spike: 'telescope',
    };
    const statusColors: Record<string, string> = {
      open: 'charts.blue',
      in_progress: isTaskStale ? 'charts.orange' : 'charts.yellow',
      blocked: 'errorForeground',
      closed: 'testing.iconPassed',
    };

    if (bead.status === 'closed') {
      const iconName = 'pass';
      const themeIcon = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(statusColors.closed));
      this.iconPath = (themeIcon || { id: iconName }) as any;
    } else {
      const iconName = typeIcons[bead.issueType || ''] || 'symbol-event';
      const iconColor = statusColors[bead.status || 'open'] || 'charts.blue';
      const themeIcon = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(iconColor));
      this.iconPath = (themeIcon || { id: iconName }) as any;
    }

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = false;
    tooltip.supportHtml = false;

    const safeTitle = sanitizeTooltipText(bead.title || bead.id);
    const safeId = sanitizeTooltipText(bead.id);
    const safeDescription = bead.description ? sanitizeTooltipText(bead.description) : undefined;
    const safeWorktree = this.worktreeId ? sanitizeTooltipText(this.worktreeId) : undefined;

    tooltip.appendMarkdown(`**${safeTitle}**\n\n`);
    tooltip.appendMarkdown(`🆔 ${safeId}\n\n`);
    tooltip.appendMarkdown(`👤 ${sanitizeTooltipText(assigneeInfo.name)}\n\n`);

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

    this.command = {
      command: 'beads.openBead',
      title: 'Open Bead',
      arguments: [bead],
    };
  }
}

export type BeadsTreeItem = StatusSectionItem | WarningSectionItem | EpicTreeItem | UngroupedSectionItem | BeadTreeItem;
