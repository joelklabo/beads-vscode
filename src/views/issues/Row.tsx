import React from 'react';
import { BeadViewModel } from './types';

interface RowProps {
  bead: BeadViewModel;
  onClick: (id: string) => void;
}

export const Row: React.FC<RowProps> = ({ bead, onClick }) => {
  const contextData = JSON.stringify({
    webviewSection: 'bead',
    id: bead.id,
    preventDefaultContextMenuItems: true
  });

  return (
    <div 
      className="bead-row" 
      onClick={() => onClick(bead.id)}
      data-vscode-context={contextData}
    >
      <div className="bead-icon" style={{ color: bead.icon?.color }}>
        <span className={`codicon codicon-${bead.icon?.id || 'circle-outline'}`} />
      </div>
      <div className="bead-content">
        <div className="bead-header">
          <span className="bead-title">{bead.title}</span>
          <span className="bead-id">{bead.id}</span>
        </div>
        {bead.description && (
          <div className="bead-description">{bead.description}</div>
        )}
        <div className="bead-meta">
          <div className="bead-tag">
            <span className="codicon codicon-circle-filled" style={{ fontSize: '10px', color: getStatusColor(bead.status) }} />
            {bead.status}
          </div>
          {bead.assignee && (
            <div className="bead-tag">
              <span className="codicon codicon-account" />
              {bead.assignee.name}
            </div>
          )}
          {bead.labels.length > 0 && (
            <div className="bead-labels">
              {bead.labels.map(label => (
                <span key={label} className="bead-label">{label}</span>
              ))}
            </div>
          )}
        </div>
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
