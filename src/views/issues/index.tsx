import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Row } from './Row';
import { BeadViewModel, WebviewMessage, WebviewCommand } from './types';
import { buildSharedStyles } from '../shared/theme';
import './style.css';

// VS Code API
declare global {
  interface Window {
    vscode: {
      postMessage: (message: WebviewCommand) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

const vscode = window.vscode;

const Section: React.FC<{ 
  title: string; 
  count: number; 
  children: React.ReactNode; 
  defaultCollapsed?: boolean;
  className?: string;
  icon?: string;
}> = ({ title, count, children, defaultCollapsed = false, className = '', icon }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => setCollapsed(!collapsed);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };
  
  return (
    <div className={`section ${className} ${collapsed ? 'collapsed' : ''}`} data-collapsed={collapsed}>
      <div
        className="section-header"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
      >
        <span className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} collapse-icon`} />
        {icon && <span className={`codicon codicon-${icon}`} style={{ marginRight: 4 }} />}
        <span className="section-title">{title}</span>
        <span className="section-count">{count}</span>
      </div>
      {!collapsed && <div className="section-content">{children}</div>}
    </div>
  );
};

const App: React.FC = () => {
  const [beads, setBeads] = useState<BeadViewModel[]>([]);
  const [sortMode, setSortMode] = useState<string>('id');
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Beads Issues View mounted');

    // Inject shared badge/token CSS into the webview document
    const sharedStyle = document.createElement('style');
    sharedStyle.textContent = buildSharedStyles();
    document.head.appendChild(sharedStyle);

    const handler = (event: MessageEvent<WebviewMessage>) => {
      console.log('Received message:', event.data);
      const message = event.data;
      if (message.type === 'update') {
        setBeads(message.beads);
        if (message.sortMode) {
          setSortMode(message.sortMode);
        }
        setLoading(false);
      }
    };

    window.addEventListener('message', handler);
    // Signal ready
    vscode.postMessage({ command: 'ready' } as any);
    return () => {
      window.removeEventListener('message', handler);
      document.head.removeChild(sharedStyle);
    };
  }, []);

  const handleOpen = (id: string) => {
    vscode.postMessage({ command: 'open', id });
  };

  const handleSort = () => {
    vscode.postMessage({ command: 'pickSort' } as any);
  };

  const renderSection = (title: string, items: BeadViewModel[], icon: string, className: string = '', defaultCollapsed = false) => {
    if (items.length === 0) return null;
    return (
      <Section 
        key={title} 
        title={title} 
        count={items.length} 
        icon={icon} 
        className={className}
        defaultCollapsed={defaultCollapsed}
      >
        {items.map(bead => (
          <Row key={bead.id} bead={bead} onClick={handleOpen} compact={compact} />
        ))}
      </Section>
    );
  };

  const renderGroups = () => {
    if (loading) {
      return <div className="loading">Loading...</div>;
    }

    if (beads.length === 0) {
      return (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
          No tasks found.
        </div>
      );
    }

    if (sortMode === 'status') {
      const groups = {
        in_progress: [] as BeadViewModel[],
        open: [] as BeadViewModel[],
        blocked: [] as BeadViewModel[],
        closed: [] as BeadViewModel[]
      };
      beads.forEach(b => {
        const s = b.status as keyof typeof groups || 'open';
        if (groups[s]) groups[s].push(b);
        else groups.open.push(b);
      });

      return (
        <>
          {renderSection('In Progress', groups.in_progress, 'play', 'in-progress-section')}
          {renderSection('Open', groups.open, 'circle-outline')}
          {renderSection('Blocked', groups.blocked, 'stop')}
          {renderSection('Closed', groups.closed, 'pass', '', true)}
        </>
      );
    } else if (sortMode === 'assignee') {
      const groups: Record<string, BeadViewModel[]> = {};
      beads.forEach(b => {
        const assignee = b.assignee?.name || 'Unassigned';
        if (!groups[assignee]) groups[assignee] = [];
        groups[assignee].push(b);
      });

      return (
        <>
          {Object.keys(groups).sort().map(assignee => 
            renderSection(assignee, groups[assignee], 'account')
          )}
        </>
      );
    } else if (sortMode === 'epic') {
      const groups: Record<string, BeadViewModel[]> = {};
      beads.forEach(b => {
        const epic = b.epicId || 'No Epic';
        if (!groups[epic]) groups[epic] = [];
        groups[epic].push(b);
      });

      return (
        <>
          {Object.keys(groups).sort().map(epic => 
            renderSection(epic, groups[epic], 'milestone')
          )}
        </>
      );
    } else {
      // Default (ID) or Epic (fallback for now)
      const inProgress = beads.filter(b => b.status === 'in_progress');
      const other = beads.filter(b => b.status !== 'in_progress');

      return (
        <>
          {renderSection('In Progress', inProgress, 'play', 'in-progress-section')}
          {renderSection('Backlog', other, 'issues')}
        </>
      );
    }
  };

  return (
    <div className="bead-view">
      <div className="bead-view-header">
        <span className="bead-count">{beads.length} tasks</span>
        <div className="bead-actions">
          <button 
            className={`icon-button ${compact ? 'active' : ''}`} 
            onClick={() => setCompact(!compact)} 
            title={compact ? "Switch to Detailed View" : "Switch to Compact View"}
          >
            <span className="codicon codicon-list-flat" />
          </button>
          <button className="icon-button" onClick={handleSort} title="Sort">
            <span className="codicon codicon-sort-precedence" />
          </button>
        </div>
      </div>
      <div className="bead-list">
        {renderGroups()}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
