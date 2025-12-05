import React from 'react';
import { GraphEdgeData, GraphNodeData } from '@beads/core';

interface Props {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export function Graph({ nodes, edges }: Props): JSX.Element {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Dependency Graph</div>
        <div className="panel-subtitle">{nodes.length} nodes · {edges.length} edges</div>
      </div>
      {edges.length === 0 ? (
        <div className="empty">No dependencies found.</div>
      ) : (
        <ul className="edge-list" aria-label="Dependency edges">
          {edges.map((edge) => (
            <li key={`${edge.sourceId}->${edge.targetId}`}>
              <span className="edge-id">{edge.sourceId}</span>
              <span className="muted"> → </span>
              <span className="edge-id">{edge.targetId}</span>
              {edge.type && <span className="pill pill-ghost">{edge.type}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Graph;
