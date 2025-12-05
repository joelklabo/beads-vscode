import React, { useEffect, useMemo, useState } from 'react';
import { BeadsStore, WorkspaceTarget } from '@beads/core';
import { useBeadsView, useBeadDetail, useGraphData } from '@beads/ui-headless';
import BeadList from './components/BeadList';
import BeadDetail from './components/BeadDetail';
import Graph from './components/Graph';
import ErrorBanner from './components/ErrorBanner';
import { createLoader } from './services/beadsSource';

const DEFAULT_WORKSPACE = (import.meta.env.VITE_WORKSPACE_ROOT as string) || '.';

export default function App(): JSX.Element {
  const [preferMock, setPreferMock] = useState(import.meta.env.VITE_USE_MOCK === 'true');
  const [usingMockData, setUsingMockData] = useState(preferMock);
  const [error, setError] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const workspaces = useMemo<WorkspaceTarget[]>(() => [{ id: 'primary', root: DEFAULT_WORKSPACE }], []);

  const loader = useMemo(
    () =>
      createLoader({
        preferMock,
        onError: setError,
        onModeChange: setUsingMockData,
      }),
    [preferMock]
  );

  const store = useMemo(() => new BeadsStore({ loader, onError: (err) => setError(String(err)) }), [loader]);

  useEffect(() => () => store.dispose(), [store]);

  const beadsView = useBeadsView({ workspaces, query, store });
  const detail = useBeadDetail({ beadId: selectedId ?? beadsView.items[0]?.id ?? '', workspaces, store });
  const graph = useGraphData(workspaces, store);

  useEffect(() => {
    if (!selectedId && beadsView.items.length > 0) {
      setSelectedId(beadsView.items[0].id);
    }
  }, [selectedId, beadsView.items]);

  const handleRefresh = (): void => {
    setError(undefined);
    void beadsView.refresh();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Beads Web Shell</h1>
          <p className="muted">Shared core + headless hooks rendered in React DOM</p>
        </div>
        <div className="controls">
          <label className="control">
            <input
              type="checkbox"
              checked={preferMock}
              onChange={(e) => setPreferMock(e.target.checked)}
              aria-label="Use mock data"
            />
            Use mock data
          </label>
          <button className="button" onClick={handleRefresh} disabled={beadsView.loading}>
            {beadsView.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="status-bar">
        <span className="pill pill-ghost">Workspace: {DEFAULT_WORKSPACE}</span>
        <span className={`pill ${usingMockData ? 'pill-warn' : 'pill-success'}`}>
          {usingMockData ? 'Mock data' : 'bd CLI data'}
        </span>
        {beadsView.loading && <span className="pill">Loading…</span>}
      </div>

      <div className="search-row">
        <input
          type="search"
          placeholder="Filter beads by id, title, description"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search beads"
        />
      </div>

      <main className="layout">
        <BeadList items={beadsView.items} selectedId={selectedId} onSelect={setSelectedId} loading={beadsView.loading} />
        <BeadDetail bead={detail.bead} upstream={detail.upstream} downstream={detail.downstream} loading={beadsView.loading} />
        <Graph nodes={graph.nodes} edges={graph.edges} />
      </main>
    </div>
  );
}
