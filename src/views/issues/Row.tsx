import React from 'react';
import { BeadViewModel } from './types';
import { getAssigneeToken, getIssueTypeToken, getPriorityToken, getStatusToken, chipClass, DensityScale } from '../shared/theme';

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

  const density: DensityScale = compact ? 'compact' : 'default';
  const chipBase = chipClass(density);
  const statusToken = getStatusToken(bead.status);
  const priorityToken = getPriorityToken(bead.priority);
  const issueTypeToken = getIssueTypeToken((bead as any)?.issueType);
  const assigneeToken = bead.assignee ? getAssigneeToken(bead.assignee.color) : undefined;

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
          style={{ color: bead.icon?.color }} 
          title={bead.id}
        />
      </div>
      
      <div className="bead-content-column">
        <div className="bead-primary-line">
          <span className="bead-title" title={bead.title}>{bead.title}</span>
          <div className="bead-primary-meta">
            <span className={`${chipBase} id`} aria-label={`Task ${bead.id}`}>
              <span className="codicon codicon-tag" aria-hidden="true" />
              <span className="chip-label">{bead.id}</span>
            </span>
            <span className="bead-time" title={new Date(bead.updatedAt).toLocaleString()}>
              {formatRelativeTime(bead.updatedAt)}
            </span>
          </div>
        </div>
        
        <div className="bead-secondary-line">
          <span 
            className={`${chipBase} status status-${statusToken.id} ${statusToken.pulsing ? 'pulsing' : ''}`} 
            aria-label={`Status ${statusToken.label}`}
          >
            <span className={`codicon codicon-${statusToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{statusToken.label}</span>
          </span>

          <span 
            className={`${chipBase} type type-${issueTypeToken.id}`} 
            aria-label={`Type ${issueTypeToken.label}`}
          >
            <span className={`codicon codicon-${issueTypeToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{issueTypeToken.label}</span>
          </span>

          <span 
            className={`${chipBase} priority priority-${priorityToken.id}`} 
            aria-label={`Priority ${priorityToken.label}`}
          >
            <span className={`codicon codicon-${priorityToken.icon}`} aria-hidden="true" />
            <span className="chip-label">{priorityToken.label}</span>
          </span>

          {assigneeToken && (
            <span
              className={`${chipBase} assignee`}
              aria-label={`Assignee ${bead.assignee?.name}`}
              style={
                {
                  '--bead-assignee-color': assigneeToken.color,
                  '--bead-assignee-bg': assigneeToken.background,
                } as React.CSSProperties
              }
              title={bead.assignee?.name}
            >
              <span className="codicon codicon-account" aria-hidden="true" />
              <span className="chip-label">{bead.assignee?.name}</span>
            </span>
          )}
        </div>
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
