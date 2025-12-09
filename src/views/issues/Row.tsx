import React from 'react';
import { BeadViewModel } from './types';
import { getIssueTypeToken, getPriorityToken, getStatusToken } from '../shared/theme';

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

  const typeToken = getIssueTypeToken(bead.issueType);
  const statusToken = getStatusToken(bead.status);
  const priorityToken = getPriorityToken(bead.priority);

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
          <span className="bead-time" title={new Date(bead.updatedAt).toLocaleString()}>
            {formatRelativeTime(bead.updatedAt)}
          </span>
        </div>
        
        <div className="bead-secondary-line">
          <span className="bead-id">
            <span className={`codicon codicon-${typeToken.icon} type-dot`} style={{ color: typeToken.color }} />
            {bead.id}
          </span>
          <span className="bead-separator">•</span>
          
          <span className={`bead-chip priority priority-${priorityToken.id}`} title={`Priority ${priorityToken.label}`}>
            <span className={`codicon codicon-${priorityToken.icon}`} />
            {!compact && priorityToken.label}
          </span>
          <span className="bead-separator">•</span>

          <span
            className={`bead-chip status status-${statusToken.id} ${statusToken.pulsing ? 'pulsing' : ''}`}
            title={statusToken.label}
          >
            <span className={`codicon codicon-${statusToken.icon}`} />
            {!compact && statusToken.label}
          </span>
          
          {bead.assignee && (
            <>
              <span className="bead-separator">•</span>
              <span
                className="bead-chip assignee"
                style={{
                  color: bead.assignee.color,
                  background: `color-mix(in srgb, ${bead.assignee.color} 18%, transparent)`,
                  borderColor: `color-mix(in srgb, ${bead.assignee.color} 35%, transparent)`,
                }}
                title={bead.assignee.name}
              >
                <span className="assignee-initials">{bead.assignee.initials}</span>
                {!compact && bead.assignee.name}
              </span>
            </>
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
