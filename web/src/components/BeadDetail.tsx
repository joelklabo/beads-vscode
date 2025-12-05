import React from 'react';
import { BeadItemData, GraphEdgeData } from '@beads/core';

interface Props {
  bead?: BeadItemData;
  upstream: GraphEdgeData[];
  downstream: GraphEdgeData[];
  loading?: boolean;
}

function renderEdges(edges: GraphEdgeData[], direction: 'upstream' | 'downstream'): JSX.Element {
  if (!edges.length) {
    return <div className="muted">None</div>;
  }

  return (
    <ul className="edge-list" aria-label={`${direction} dependencies`}>
      {edges.map((edge) => (
        <li key={`${edge.sourceId}->${edge.targetId}`}> 
          <span className="edge-id">{direction === 'upstream' ? edge.sourceId : edge.targetId}</span>
          <span className="muted">{direction === 'upstream' ? ' → ' : ' ← '}</span>
          <span className="edge-id">{direction === 'upstream' ? edge.targetId : edge.sourceId}</span>
          {edge.type && <span className="pill pill-ghost">{edge.type}</span>}
        </li>
      ))}
    </ul>
  );
}

export function BeadDetail({ bead, upstream, downstream, loading }: Props): JSX.Element {
  if (!bead) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Details</div>
          {loading && <div className="pill">Loading…</div>}
        </div>
        <div className="empty">Select a bead to view details.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">{bead.title}</div>
          <div className="panel-subtitle">{bead.id}</div>
        </div>
        <div className="pill">{bead.status || 'open'}</div>
      </div>
      <p className="muted">Priority P{bead.priority ?? 4}</p>
      {bead.description && <p className="description">{bead.description}</p>}

      <section className="section">
        <h4>Upstream</h4>
        {renderEdges(upstream, 'upstream')}
      </section>

      <section className="section">
        <h4>Downstream</h4>
        {renderEdges(downstream, 'downstream')}
      </section>

      {bead.tags && bead.tags.length > 0 && (
        <div className="tags" aria-label="labels">
          {bead.tags.map((tag) => (
            <span key={tag} className="pill pill-ghost">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default BeadDetail;
