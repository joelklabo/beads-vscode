import React from 'react';
import { BeadViewModel } from './types';

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

  const priorityIcon = getPriorityIcon(bead.priority);
  const priorityColor = getPriorityColor(bead.priority);

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
          <span className="bead-id">{bead.id}</span>
          <span className="bead-separator">•</span>
          
          <span className="bead-priority" style={{ color: priorityColor }} title={`Priority ${bead.priority}`}>
            <span className={`codicon ${priorityIcon}`} />
            {!compact && <span className="bead-meta-text">P{bead.priority}</span>}
          </span>
          <span className="bead-separator">•</span>

          <span className="bead-status" style={{ color: getStatusColor(bead.status) }}>
            <span className="codicon codicon-circle-filled" />
            {!compact && <span className="bead-meta-text">{bead.status}</span>}
          </span>
          
          {bead.assignee && (
            <>
              <span className="bead-separator">•</span>
              <span className="bead-assignee" title={bead.assignee.name}>
                <span className="codicon codicon-account" />
                {!compact && <span className="bead-meta-text">{bead.assignee.name}</span>}
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'open': return 'var(--vscode-charts-green)';
    case 'in_progress': return 'var(--vscode-charts-blue)';
    case 'blocked': return 'var(--vscode-charts-red)';
    case 'closed': return 'var(--vscode-disabledForeground)';
    default: return 'var(--vscode-foreground)';
  }
}

function getPriorityIcon(p: number): string {
  if (p === 0) return 'codicon-flame';
  if (p === 1) return 'codicon-arrow-up';
  if (p === 2) return 'codicon-arrow-right';
  return 'codicon-arrow-down';
}

function getPriorityColor(p: number): string {
  if (p === 0) return 'var(--vscode-charts-red)';
  if (p === 1) return 'var(--vscode-charts-orange)';
  return 'var(--vscode-descriptionForeground)';
}

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
