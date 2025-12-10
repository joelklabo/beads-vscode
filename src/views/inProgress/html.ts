import * as vscode from 'vscode';
import { BeadItemData, sanitizeInlineText, escapeHtml, deriveAssigneeName } from '../../utils';
import { buildSharedStyles, getIssueTypeToken, getPriorityToken, getStatusToken } from '../shared/theme';

const t = vscode.l10n.t;

export interface InProgressPanelStrings {
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

export const buildInProgressPanelStrings = (): InProgressPanelStrings => ({
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

export function getInProgressPanelHtml(items: BeadItemData[], strings: InProgressPanelStrings, locale: string): string {
  const heroStatus = getStatusToken('in_progress');

  const normalized = items.map((item) => {
    const ageInfo = formatInProgressAge(item.inProgressSince ?? item.updatedAt);
    const assigneeRaw = deriveAssigneeName(item, strings.assigneeFallback);
    const assignee = sanitizeInlineText(assigneeRaw) || strings.assigneeFallback;
    const color = colorForAssignee(assigneeRaw || strings.assigneeFallback);
    const issueTypeToken = getIssueTypeToken((item.raw as any)?.issue_type || 'task');
    const priorityToken = getPriorityToken((item.raw as any)?.priority);
    const statusToken = getStatusToken(item.status);
    return {
      item,
      ageLabel: ageInfo.label,
      ageMs: ageInfo.ms,
      assignee,
      color,
      blockers: item.blockingDepsCount ?? 0,
      issueTypeToken,
      priorityToken,
      statusToken,
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
            <div class="bead-chip assignee" style="color: ${entry.color}; background: color-mix(in srgb, ${entry.color} 18%, transparent); border-color: color-mix(in srgb, ${entry.color} 35%, transparent);">
              <span class="assignee-initials">${escapeHtml(entry.assignee.slice(0,2).toUpperCase())}</span>
              <span class="assignee-name">${escapeHtml(entry.assignee)}</span>
            </div>
          </div>
          <div class="wip-title">${escapeHtml(entry.item.title)}</div>
          <div class="wip-meta">
            <span class="bead-chip status status-${entry.statusToken.id} ${entry.statusToken.pulsing ? 'pulsing' : ''}">
              <span class="codicon codicon-${entry.statusToken.icon}"></span>${entry.statusToken.label}
            </span>
            <span class="bead-chip priority priority-${entry.priorityToken.id}">
              <span class="codicon codicon-${entry.priorityToken.icon}"></span>${entry.priorityToken.label}
            </span>
            <span class="bead-chip type type-${entry.issueTypeToken.id}">
              <span class="codicon codicon-${entry.issueTypeToken.icon}"></span>${entry.issueTypeToken.label}
            </span>
            <span class="meta-item subtle">${escapeHtml(strings.ageLabel)}: <strong>${escapeHtml(entry.ageLabel)}</strong></span>
            <span class="meta-item subtle">${escapeHtml(strings.blockersCountLabel)}: <strong>${entry.blockers}</strong></span>
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
    ${buildSharedStyles()}
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: radial-gradient(circle at 20% 20%, rgba(55, 148, 255, 0.06), transparent 25%),
                  radial-gradient(circle at 80% 0%, rgba(249, 197, 19, 0.05), transparent 22%),
                  var(--vscode-editor-background);
      margin: 0;
      padding: 16px 20px 28px;
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
      gap: 12px;
    }
    .wip-hero {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
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
      padding: 10px 12px;
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
      padding: 12px 14px;
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
      gap: 10px;
      margin-top: 8px;
    }
    .wip-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 10px 12px;
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
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
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
      margin: 0 0 4px 0;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .wip-meta {
      display: flex;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      flex-wrap: nowrap;
      overflow: hidden;
      align-items: center;
    }
    .bead-chip.assignee .assignee-initials {
      font-weight: 700; letter-spacing: 0.2px;
    }
    .bead-chip.assignee .assignee-name {
      font-weight: 600;
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
    <div class="wip-hero">
      <h1>${escapeHtml(strings.title)}</h1>
      <span class="bead-chip status status-${heroStatus.id} ${heroStatus.pulsing ? 'pulsing' : ''}">
        <span class="codicon codicon-${heroStatus.icon}"></span>${heroStatus.label}
      </span>
    </div>
    <div class="subtle">${escapeHtml(strings.wipSubtitle)}</div>

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
