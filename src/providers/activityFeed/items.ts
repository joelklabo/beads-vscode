import * as vscode from 'vscode';
import { buildPreviewSnippet, sanitizeTooltipText, stripBeadIdPrefix } from '../../utils';
import { EventData } from '../../activityFeed';
import { formatRelativeTimeDetailed } from '../../activityFeed';

export interface ActivityStatistics {
  eventsToday: number;
  eventsThisWeek: number;
  mostActiveIssue?: { issueId: string; count: number };
  issuesClosedLastWeek: number;
  velocity: number;
  currentStreak: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEventSummary(event: EventData): string | undefined {
  const base = (event.comment || event.description || '').trim();
  if (!base) {
    return undefined;
  }

  const pattern = new RegExp(`#?${escapeRegex(event.issueId)}`, 'gi');
  const cleaned = base.replace(pattern, '').replace(/\s+/g, ' ').trim();

  return cleaned || base;
}

export class TimeGroupItem extends vscode.TreeItem {
  public readonly events: EventData[];
  public readonly groupName: string;

  constructor(groupName: string, events: EventData[], isCollapsed: boolean = false) {
    super(
      groupName,
      isCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
    );

    this.groupName = groupName;
    this.events = events;
    this.contextValue = 'timeGroup';

    this.description = `${events.length} event${events.length !== 1 ? 's' : ''}`;

    const iconMap: Record<string, string> = {
      Today: 'calendar',
      Yesterday: 'history',
      'This Week': 'calendar',
      'Last Week': 'calendar',
      'This Month': 'calendar',
      Older: 'archive',
    };

    this.iconPath = new vscode.ThemeIcon(iconMap[groupName] || 'calendar', new vscode.ThemeColor('foreground'));
    this.tooltip = `${groupName}: ${events.length} event${events.length !== 1 ? 's' : ''}`;
  }
}

export class ActivityEventItem extends vscode.TreeItem {
  public readonly event: EventData;

  constructor(event: EventData, worktreeId?: string) {
    const cleanTitle = stripBeadIdPrefix(event.issueTitle || event.description || event.issueId, event.issueId);
    super(cleanTitle || event.description || event.issueId, vscode.TreeItemCollapsibleState.None);

    this.event = event;
    this.contextValue = 'activityEvent';

    const summary = buildEventSummary(event);
    const descParts = [event.issueId];

    if (summary) {
      const preview = buildPreviewSnippet(summary, 80);
      if (preview) {
        descParts.push(preview);
      }
    }

    const relative = formatRelativeTimeDetailed(event.createdAt);
    if (relative) {
      descParts.push(relative);
    }

    this.description = descParts.join(' · ');

    const iconColors: Record<string, string> = {
      'event-created': 'charts.yellow',
      'event-success': 'testing.iconPassed',
      'event-warning': 'charts.yellow',
      'event-info': 'charts.blue',
      'event-purple': 'charts.purple',
      'event-default': 'foreground',
    };

    this.iconPath = new vscode.ThemeIcon(event.iconName, new vscode.ThemeColor(iconColors[event.colorClass] || 'foreground'));
    this.tooltip = this.buildTooltip(event, worktreeId, summary);
    this.command = {
      command: 'beads.activityFeed.openEvent',
      title: 'Open Issue',
      arguments: [event.issueId],
    };
  }

  private buildTooltip(event: EventData, worktreeId: string | undefined, summary: string | undefined): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportHtml = false;

    const safeTitle = sanitizeTooltipText(event.issueTitle || event.description || event.issueId);
    const safeId = sanitizeTooltipText(event.issueId);
    const safeSummary = summary ? sanitizeTooltipText(summary) : undefined;
    const safeActor = sanitizeTooltipText(event.actor);
    const safeTimestamp = sanitizeTooltipText(event.createdAt.toLocaleString());
    const safeWorktree = worktreeId ? sanitizeTooltipText(worktreeId) : undefined;

    md.appendMarkdown(`**${safeTitle}**\n\n`);
    md.appendMarkdown(`📋 Issue: \`${safeId}\`\n\n`);

    if (safeSummary) {
      md.appendMarkdown(`${safeSummary}\n\n`);
    }

    md.appendMarkdown(`👤 Actor: ${safeActor}\n\n`);
    md.appendMarkdown(`🕐 ${safeTimestamp}\n`);
    if (safeWorktree) {
      md.appendMarkdown(`\n🏷️ Worktree: ${safeWorktree}\n`);
    }

    return md;
  }
}

export class StatisticsSectionItem extends vscode.TreeItem {
  constructor(public readonly statistics: ActivityStatistics) {
    super('📊 Activity Statistics', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'statisticsSection';
    this.description = `${statistics.eventsToday} today`;
    this.tooltip = this.buildTooltip(statistics);
  }

  private buildTooltip(stats: ActivityStatistics): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown('### Activity Statistics\n\n');
    md.appendMarkdown(`📅 **Events Today**: ${stats.eventsToday}\n\n`);
    md.appendMarkdown(`📆 **Events This Week**: ${stats.eventsThisWeek}\n\n`);

    if (stats.mostActiveIssue) {
      md.appendMarkdown(`🔥 **Most Active Issue**: ${stats.mostActiveIssue.issueId} (${stats.mostActiveIssue.count} events)\n\n`);
    }

    md.appendMarkdown(`📈 **Issues Closed (7 days)**: ${stats.issuesClosedLastWeek}\n\n`);
    md.appendMarkdown(`⚡ **Velocity**: ${stats.velocity.toFixed(1)} issues/day\n\n`);

    if (stats.currentStreak > 0) {
      md.appendMarkdown(`🔥 **Current Streak**: ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}\n\n`);
    }

    return md;
  }
}

export class StatisticItem extends vscode.TreeItem {
  constructor(label: string, value: string, icon: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.contextValue = 'statisticItem';
    this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor('foreground'));
    if (description) {
      this.tooltip = description;
    }
  }
}

export function createStatisticItems(stats: ActivityStatistics): StatisticItem[] {
  const items: StatisticItem[] = [];

  items.push(new StatisticItem('Events Today', stats.eventsToday.toString(), 'calendar', 'Number of events recorded today'));
  items.push(new StatisticItem('Events This Week', stats.eventsThisWeek.toString(), 'calendar', 'Number of events in the last 7 days'));

  if (stats.mostActiveIssue) {
    items.push(new StatisticItem('Most Active Issue', stats.mostActiveIssue.issueId, 'flame', `${stats.mostActiveIssue.count} events`));
  }

  items.push(new StatisticItem('Issues Closed (7d)', stats.issuesClosedLastWeek.toString(), 'pass', 'Issues closed in the last 7 days'));
  items.push(new StatisticItem('Velocity', `${stats.velocity.toFixed(1)}/day`, 'graph', 'Average issues closed per day'));

  if (stats.currentStreak > 0) {
    items.push(new StatisticItem('Current Streak', `${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`, 'flame', 'Consecutive days with activity'));
  }

  return items;
}

export function createTimeGroups(grouped: Map<string, EventData[]>, collapsedGroups: Set<string>): TimeGroupItem[] {
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Older'];
  const groups: TimeGroupItem[] = [];

  for (const groupName of groupOrder) {
    const events = grouped.get(groupName);
    if (events && events.length > 0) {
      const isCollapsed = collapsedGroups.has(groupName);
      groups.push(new TimeGroupItem(groupName, events, isCollapsed));
    }
  }

  return groups;
}

export type ActivityTreeItem = StatisticsSectionItem | StatisticItem | TimeGroupItem | ActivityEventItem;
