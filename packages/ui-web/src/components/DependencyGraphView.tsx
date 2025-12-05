import React from 'react';
import { ThemeTokens, lightTokens } from '../theme/tokens';

export interface GraphNodeView {
  id: string;
  title?: string;
}

export interface GraphEdgeView {
  sourceId: string;
  targetId: string;
  type?: string;
}

export interface DependencyGraphViewProps {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  onSelectNode?: (id: string) => void;
  tokens?: ThemeTokens;
}

export const DependencyGraphView: React.FC<DependencyGraphViewProps> = ({ nodes, edges, onSelectNode, tokens = lightTokens }) => {
  return (
    <section aria-label="dependency-graph" style={{ border: `1px solid ${tokens.border}`, borderRadius: 8, padding: 10 }}>
      <div role="list" aria-label="graph-nodes" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {nodes.map((node) => (
          <button
            key={node.id}
            role="listitem"
            aria-label={`node-${node.id}`}
            onClick={() => onSelectNode?.(node.id)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${tokens.border}`,
              background: tokens.surface,
              cursor: 'pointer',
            }}
          >
            {node.title ?? node.id}
          </button>
        ))}
      </div>
      <div role="list" aria-label="graph-edges" style={{ marginTop: 8 }}>
        {edges.map((edge, idx) => (
          <div key={`${edge.sourceId}-${edge.targetId}-${idx}`} role="listitem" style={{ color: tokens.muted }}>
            {edge.sourceId} → {edge.targetId} {edge.type ? `(${edge.type})` : ''}
          </div>
        ))}
        {edges.length === 0 && <div role="listitem">No edges</div>}
      </div>
    </section>
  );
};
