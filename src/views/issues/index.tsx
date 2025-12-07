import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Row } from './Row';
import { BeadViewModel, WebviewMessage, WebviewCommand } from './types';
import './style.css';

// VS Code API
declare const acquireVsCodeApi: () => {
  postMessage: (message: WebviewCommand) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

const App: React.FC = () => {
  const [beads, setBeads] = useState<BeadViewModel[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;
      if (message.type === 'update') {
        setBeads(message.beads);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpen = (id: string) => {
    vscode.postMessage({ command: 'open', id });
  };

  return (
    <div className="bead-list">
      {beads.map(bead => (
        <Row key={bead.id} bead={bead} onClick={handleOpen} />
      ))}
      {beads.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
          No issues found.
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
