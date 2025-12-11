import React from 'react';
import { BeadViewModel } from './types';
import { getAssigneeToken, getIssueTypeToken, getPriorityToken, getStatusToken } from '../shared/theme';

interface RowProps {
  bead: BeadViewModel;
  onClick: (id: string) => void;
  compact?: boolean;
}

export const Row: React.FC<RowProps> = ({ bead, onClick, compact }) => {
  const contextData = JSON.stringify({
    webviewSection: 'bead',
    id: bead.id,
    preventDefaultContextMenuItems: true
  });

  const statusToken = getStatusToken(bead.status);
  const priorityToken = getPriorityToken(bead.priority);
  const issueTypeToken = getIssueTypeToken((bead as any)?.issueType);
  const assigneeToken = bead.assignee ? getAssigneeToken(bead.assignee.color) : undefined;
  const chipSize = compact ? 'sm' : '';

  return (
    <div 
      className={`bead-row ${compact ? 'compact' : ''}`} 
      onClick={() => onClick(bead.id)}
      data-vscode-context={contextData}
      role="button"
      tabIndex={0}
    >
      <div className="bead-icon-column">
        <span 
          className={`codicon codicon-${bead.icon?.id || 'circle-outline'}`} 
          title={bead.id}
        />
      </div>
      
      <div className="bead-content-column">
        <div className="bead-primary-line">
          <span className="bead-title" title={bead.title}>{bead.title}</span>
          <span className="bead-time" title={new Date(bead.updatedAt).toLocaleString()}>
            {formatRelativeTime(bead.updatedAt)}
          </span>
        </div>
        
        <div className="bead-secondary-line">
          <span className={`bead-chip id ${chipSize}`} aria-label={`Task ${bead.id}`}>
            <span className="codicon codicon-tag" aria-hidden="true" />
            <span className="chip-label">{bead.id}</span>
          </span>

          <span 
            className={`bead-chip status status-${statusToken.id} ${statusToken.pulsing ? 'pulsing' : ''} ${chipSize}`} 
            aria-label={`Status ${statusToken.label}`}
          >
            <span className={`codicon codicon-${statusToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{statusToken.label}</span>
          </span>

          <span 
            className={`bead-chip type type-${issueTypeToken.id} ${chipSize}`} 
            aria-label={`Type ${issueTypeToken.label}`}
          >
            <span className={`codicon codicon-${issueTypeToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{issueTypeToken.label}</span>
          </span>

          <span 
            className={`bead-chip priority priority-${priorityToken.id} ${chipSize}`} 
            aria-label={`Priority ${priorityToken.label}`}
          >
            <span className={`codicon codicon-${priorityToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{priorityToken.label}</span>
          </span>

          {assigneeToken && (
            <span
              className={`bead-chip assignee ${chipSize}`}
              aria-label={`Assignee ${bead.assignee?.name}`}
              title={bead.assignee?.name}
            >
              <span className="codicon codicon-account" aria-hidden="true" />
              <span className="chip-label">{bead.assignee?.name}</span>
            </span>
          )}
        </div>

        {!compact && bead.labels.length > 0 && (
          <div className="bead-tertiary-line">
            {bead.labels.map(label => (
              <span key={label} className="bead-label">{label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 30) return date.toLocaleDateString();
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'now';
  } catch (e) {
    return '';
  }
}
