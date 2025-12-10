import * as vscode from 'vscode';
import type { EventData } from '../../activityFeed';
import { buildSharedStyles, getIssueTypeToken, getStatusToken, PULSE_ANIMATION_NAME } from '../shared/theme';
import { escapeHtml } from '../../utils';

const t = vscode.l10n.t;

export interface ActivityFeedStrings {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  eventsLabel: string;
}

export function getActivityFeedPanelHtml(events: EventData[], strings: ActivityFeedStrings, locale: string): string {
  const statusForEvent = (event: EventData) => {
    switch (event.colorClass) {
      case 'event-success': return getStatusToken('closed');
      case 'event-warning': return getStatusToken('blocked');
      case 'event-created': return getStatusToken('in_progress');
      case 'event-info': return getStatusToken('open');
      default: return getStatusToken('open');
    }
  };

  const typeForEvent = (event: EventData) => getIssueTypeToken((event as any)?.issueType || 'task');

  const codiconMap: Record<string, string> = {
    sparkle: 'codicon-sparkle',
    check: 'codicon-check',
    sync: 'codicon-sync',
    'git-merge': 'codicon-git-merge',
    'git-compare': 'codicon-git-compare',
    edit: 'codicon-edit',
    note: 'codicon-note',
    flame: 'codicon-flame',
    tag: 'codicon-tag',
    close: 'codicon-close',
    'person-add': 'codicon-account-add',
    person: 'codicon-account',
    comment: 'codicon-comment-discussion',
    history: 'codicon-history',
    question: 'codicon-question',
  };

  const eventCards = events.map(event => {
    const statusToken = statusForEvent(event);
    const typeToken = typeForEvent(event);
    const iconClass = codiconMap[event.iconName] || 'codicon-symbol-event';
    const time = event.createdAt.toLocaleString(locale);
    const actorLabel = escapeHtml(t('by {0}', event.actor));
    const actorColor = colorFromName(event.actor || 'actor');

    return `
      <div class="event-card" data-issue-id="${escapeHtml(event.issueId)}">
        <div class="timeline-dot ${statusToken.pulsing ? 'pulsing' : ''}" style="background-color: ${statusToken.color};">
          <span class="codicon ${iconClass}"></span>
        </div>
        <div class="event-content">
          <div class="event-header">
            <span class="event-description">${escapeHtml(event.description)}</span>
            <span class="event-time" title="${time}">${escapeHtml(event.createdAt.toLocaleTimeString(locale))}</span>
          </div>
          ${event.issueTitle ? `<div class="event-issue">${escapeHtml(event.issueTitle)}</div>` : ''}
          <div class="event-chips">
            <span class="bead-chip status status-${statusToken.id} ${statusToken.pulsing ? 'pulsing' : ''}">
              <span class="codicon codicon-${statusToken.icon}"></span>${statusToken.label}
            </span>
            <span class="bead-chip type type-${typeToken.id}">
              <span class="codicon codicon-${typeToken.icon}"></span>${typeToken.label}
            </span>
            <span class="bead-chip assignee" style="color: ${actorColor}; background: color-mix(in srgb, ${actorColor} 18%, transparent); border-color: color-mix(in srgb, ${actorColor} 35%, transparent);">
              <span class="assignee-initials">${escapeHtml((event.actor || '').slice(0,2).toUpperCase())}</span>
              <span class="assignee-name">${escapeHtml(event.actor)}</span>
            </span>
          </div>
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
        ${buildSharedStyles()}
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px 18px;
            margin: 0;
            line-height: 1.5;
        }

        body.compact {
            padding: 12px;
            font-size: 12px;
        }

        body.compact .event-card {
            padding: 10px 10px 10px 16px;
        }

        body.compact .event-chips {
            gap: 6px;
        }

        body.compact .bead-chip {
            padding: 1px 6px;
            gap: 4px;
            font-size: 10px;
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
            padding-left: 28px;
        }

        .timeline::before {
            content: '';
            position: absolute;
            left: 10px;
            top: 0;
            bottom: 0;
            width: 1px;
            background-color: var(--vscode-panel-border);
        }

        .event-card {
            position: relative;
            margin-bottom: 16px;
            padding: 10px 12px;
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
            left: -24px;
            top: 10px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            border: 2px solid var(--vscode-editor-background);
        }
        .timeline-dot.pulsing {
            animation: ${PULSE_ANIMATION_NAME} 1.6s ease-out infinite;
        }
        .timeline-dot .codicon { color: var(--vscode-editor-background); filter: drop-shadow(0 0 4px rgba(0,0,0,0.25)); }

        .event-content {
            display: flex;
            flex-direction: column;
            gap: 3px;
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

        .event-chips {
            display: flex;
            gap: 6px;
            flex-wrap: nowrap;
            overflow: hidden;
            align-items: center;
            margin: 4px 0;
        }

        .event-meta {
            display: flex;
            gap: 8px;
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

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 60%)`;
}
