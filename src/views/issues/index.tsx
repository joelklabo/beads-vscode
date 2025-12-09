import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Row } from './Row';
import { BeadViewModel, WebviewMessage, WebviewCommand } from './types';
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
}> = ({ title, count, children, defaultCollapsed = false, className = '' }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  
  return (
    <div className={`section ${className}`}>
      <div className="section-header" onClick={() => setCollapsed(!collapsed)}>
        <span className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
        <span className="section-title">{title}</span>
        <span className="section-count">{count}</span>
      </div>
      {!collapsed && <div className="section-content">{children}</div>}
    </div>
  );
};

const App: React.FC = () => {
  const [beads, setBeads] = useState<BeadViewModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;
      if (message.type === 'update') {
        setBeads(message.beads);
        setLoading(false);
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'ready' } as any);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpen = (id: string) => {
    vscode.postMessage({ command: 'open', id });
  };

  const { inProgress, open, closed, epics } = useMemo(() => {
    const inProgress: BeadViewModel[] = [];
    const open: BeadViewModel[] = [];
    const closed: BeadViewModel[] = [];
    const epics = new Map<string, BeadViewModel>();

    beads.forEach(bead => {
      if (bead.icon?.id === 'milestone') { // Assuming 'milestone' icon means Epic
        epics.set(bead.id, bead);
      }
      
      if (bead.status === 'in_progress') {
        inProgress.push(bead);
      } else if (bead.status === 'closed') {
        closed.push(bead);
      } else {
        open.push(bead);
      }
    });

    return { inProgress, open, closed, epics };
  }, [beads]);

  // Group open issues by Epic
  const groupedOpen = useMemo(() => {
    const groups = new Map<string, BeadViewModel[]>();
    const ungrouped: BeadViewModel[] = [];

    open.forEach(bead => {
      if (bead.epicId && epics.has(bead.epicId)) {
        const group = groups.get(bead.epicId) || [];
        group.push(bead);
        groups.set(bead.epicId, group);
      } else {
        ungrouped.push(bead);
      }
    });

    return { groups, ungrouped };
  }, [open, epics]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="bead-list">
      {inProgress.length > 0 && (
        <Section title="In Progress" count={inProgress.length} className="in-progress-section">
          {inProgress.map(bead => (
            <Row key={bead.id} bead={bead} onClick={handleOpen} />
          ))}
        </Section>
      )}

      {/* Epics Groups */}
      {Array.from(groupedOpen.groups.entries()).map(([epicId, items]) => {
        const epic = epics.get(epicId);
        return (
          <Section key={epicId} title={epic ? epic.title : epicId} count={items.length}>
            {items.map(bead => (
              <Row key={bead.id} bead={bead} onClick={handleOpen} />
            ))}
          </Section>
        );
      })}

      {/* Ungrouped Open Issues */}
      {groupedOpen.ungrouped.length > 0 && (
        <Section title="Issues" count={groupedOpen.ungrouped.length}>
          {groupedOpen.ungrouped.map(bead => (
            <Row key={bead.id} bead={bead} onClick={handleOpen} />
          ))}
        </Section>
      )}

      {/* Closed Issues */}
      {closed.length > 0 && (
        <Section title="Closed" count={closed.length} defaultCollapsed={true}>
          {closed.map(bead => (
            <Row key={bead.id} bead={bead} onClick={handleOpen} />
          ))}
        </Section>
      )}

      {beads.length === 0 && (
        <div className="empty-state">
          No tasks found.
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
