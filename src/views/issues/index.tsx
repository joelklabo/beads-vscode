import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Row } from './Row';
import { Section } from './Section';
import { BeadViewModel, WebviewMessage, WebviewCommand } from './types';
import './style.css';

// VS Code API
declare global {
  // Provided by VS Code inside the webview
  function acquireVsCodeApi(): {
    postMessage: (message: WebviewCommand) => void;
    getState: () => any;
    setState: (state: any) => void;
  };
  interface Window {
    vscode: {
      postMessage: (message: WebviewCommand) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : window.vscode;

const App: React.FC = () => {
  const [beads, setBeads] = useState<BeadViewModel[]>([]);
  const [sortMode, setSortMode] = useState<string>('id');
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || message.type !== 'update' || !Array.isArray((message as any).beads)) {
        return;
      }

      if (message.density === 'compact' || message.density === 'default') {
        setCompact(message.density === 'compact');
      }

      setBeads(message.beads);
      if (typeof message.sortMode === 'string') {
        setSortMode(message.sortMode);
      }
      setLoading(false);
    };

    window.addEventListener('message', handler);
    // Signal ready
    vscode.postMessage({ command: 'ready' } as any);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('compact', compact);
  }, [compact]);

  const handleOpen = (id: string) => {
    vscode.postMessage({ command: 'open', id });
  };

  const handleSort = () => {
    vscode.postMessage({ command: 'pickSort' } as any);
  };

  const handleOpenInProgress = () => {
    vscode.postMessage({ command: 'openInProgressPanel' } as any);
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
        <div className="empty-state">
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
          <button className="icon-button" onClick={handleOpenInProgress} title="Open In Progress">
            <span className="codicon codicon-pulse" />
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
