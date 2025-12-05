import React, { useEffect, useMemo, useState } from 'react';
import { GraphEdgeData, GraphNodeData } from '@beads/core';
import KeymapHelp from './KeymapHelp';

interface Props {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export function Graph({ nodes, edges }: Props): JSX.Element {
  const [cursor, setCursor] = useState(0);
  const [linkSource, setLinkSource] = useState<string | undefined>();
  const [announcement, setAnnouncement] = useState('Use arrow keys to move focus. Press Enter to start a link.');

  useEffect(() => {
    if (!nodes.length) {
      setCursor(0);
      setLinkSource(undefined);
      return;
    }
    setCursor((current) => Math.min(current, nodes.length - 1));
  }, [nodes.length]);

  const selectedNode = nodes[cursor];

  const relatedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter((edge) => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id);
  }, [edges, selectedNode]);

  const describeNode = (node: GraphNodeData): string => {
    const outgoing = edges.filter((e) => e.sourceId === node.id).length;
    const incoming = edges.filter((e) => e.targetId === node.id).length;
    return `${node.id}, ${node.label ?? 'node'}, ${incoming} upstream, ${outgoing} downstream`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!nodes.length) return;
    const clamp = (value: number): number => Math.min(Math.max(value, 0), nodes.length - 1);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => clamp(c + 1));
      setAnnouncement('Moved focus to next node. Press Enter to start or complete a link.');
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => clamp(c - 1));
      setAnnouncement('Moved focus to previous node. Press Enter to start or complete a link.');
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setCursor(0);
      setAnnouncement('Focused the first node in the list.');
    }

    if (event.key === 'End') {
      event.preventDefault();
      setCursor(nodes.length - 1);
      setAnnouncement('Focused the last node in the list.');
    }

    if (event.key === 'Escape') {
      setLinkSource(undefined);
      setAnnouncement('Linking cancelled.');
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const target = nodes[cursor];
      if (!target) return;

      if (linkSource && linkSource !== target.id) {
        setAnnouncement(`Connect ${linkSource} to ${target.id} (keyboard link).`);
        setLinkSource(undefined);
        return;
      }

      if (linkSource && linkSource === target.id) {
        setAnnouncement('Link start cancelled.');
        setLinkSource(undefined);
        return;
      }

      setLinkSource(target.id);
      setAnnouncement(`Link start set to ${target.id}. Move and press Enter to pick a target.`);
    }
  };

  const handleClick = (id: string, index: number): void => {
    setCursor(index);
    if (linkSource && linkSource !== id) {
      setAnnouncement(`Connect ${linkSource} to ${id} (keyboard link).`);
      setLinkSource(undefined);
      return;
    }

    if (linkSource && linkSource === id) {
      setLinkSource(undefined);
      setAnnouncement('Link start cancelled.');
      return;
    }

    setLinkSource(id);
    setAnnouncement(`Link start set to ${id}.`);
  };

  return (
    <div
      className="panel"
      role="region"
      aria-label="Dependency graph"
      aria-describedby="graph-help"
      aria-activedescendant={selectedNode ? `graph-node-${selectedNode.id}` : undefined}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="panel-header">
        <div className="panel-title">Dependency Graph</div>
        <div className="panel-subtitle">{nodes.length} nodes · {edges.length} edges</div>
      </div>

      {nodes.length === 0 && <div className="empty">No graph data.</div>}

      {nodes.length > 0 && (
        <div className="graph-grid" role="listbox" aria-label="Graph nodes" aria-activedescendant={selectedNode ? `graph-node-${selectedNode.id}` : undefined}>
          {nodes.map((node, index) => {
            const isSelected = index === cursor;
            const isLinkStart = linkSource === node.id;
            return (
              <button
                key={node.id}
                id={`graph-node-${node.id}`}
                className="graph-node"
                onClick={() => handleClick(node.id, index)}
                aria-pressed={isSelected}
                aria-selected={isSelected}
                data-link-start={isLinkStart || undefined}
                tabIndex={isSelected ? 0 : -1}
                title={describeNode(node)}
              >
                <span className="graph-node-id">{node.id}</span>
                {node.label && <span className="graph-node-label">{node.label}</span>}
                <span className="muted">{describeNode(node)}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedNode && relatedEdges.length > 0 && (
        <div className="graph-related" role="status" aria-live="polite">
          <div className="panel-subtitle">Connections for {selectedNode.id}</div>
          <ul className="edge-list" aria-label={`Edges touching ${selectedNode.id}`}>
            {relatedEdges.map((edge) => (
              <li key={`${edge.sourceId}->${edge.targetId}`}>
                <span className="edge-id">{edge.sourceId}</span>
                <span className="muted"> → </span>
                <span className="edge-id">{edge.targetId}</span>
                {edge.type && <span className="pill pill-ghost">{edge.type}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {edges.length === 0 && nodes.length > 0 && <div className="empty">No edges to display.</div>}

      {edges.length > 0 && (
        <details className="edge-summary">
          <summary>All edges (text list)</summary>
          <ul className="edge-list" aria-label="All dependency edges">
            {edges.map((edge) => (
              <li key={`${edge.sourceId}->${edge.targetId}`}>
                <span className="edge-id">{edge.sourceId}</span>
                <span className="muted"> → </span>
                <span className="edge-id">{edge.targetId}</span>
                {edge.type && <span className="pill pill-ghost">{edge.type}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <KeymapHelp
        id="graph-help"
        title="Keyboard navigation"
        items={[
          { keys: 'Tab', description: 'Focus the graph region' },
          { keys: 'Arrow keys / Home / End', description: 'Move focus across nodes' },
          { keys: 'Enter or Space', description: 'Start and finish a link between nodes (keyboard alternative to drag)' },
          { keys: 'Esc', description: 'Cancel link mode' },
        ]}
      />

      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  );
}

export default Graph;
