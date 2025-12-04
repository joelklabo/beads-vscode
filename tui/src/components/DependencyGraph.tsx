import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { GraphNode, GraphEdge, GraphFilter } from '../lib/graph';
import { detectCycles, filterGraph, layoutGraph, exportAsText } from '../lib/graph';

interface DependencyGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  filter?: GraphFilter;
  maxWidth?: number;
  onExport?: (text: string) => void;
}

const Warning: React.FC<{ message: string }> = ({ message }) => (
  <Text color="red">⚠ {message}</Text>
);

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  nodes,
  edges,
  filter,
  maxWidth = 80,
  onExport,
}) => {
  const [offset, setOffset] = useState(0);
  const [compact, setCompact] = useState(false);

  const filtered = useMemo(() => filterGraph(nodes, edges, filter), [nodes, edges, filter]);
  const lines = useMemo(
    () => layoutGraph(filtered.nodes, filtered.edges, compact ? Math.max(40, maxWidth / 2) : maxWidth),
    [filtered.nodes, filtered.edges, compact, maxWidth]
  );

  const cycleInfo = useMemo(() => detectCycles(filtered.edges), [filtered.edges]);

  useInput((input, key) => {
    if (input === 'z') setCompact((c) => !c);
    if (input === 'k' || key.upArrow) setOffset((o) => Math.max(0, o - 1));
    if (input === 'j' || key.downArrow) setOffset((o) => Math.min(Math.max(0, lines.length - 1), o + 1));
    if (input === 'e') onExport?.(exportAsText(lines));
    if (input === '0') setOffset(0);
  });

  const visible = lines.slice(offset, offset + 12);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0}>
      <Box justifyContent="space-between">
        <Text dimColor>
          j/k or arrows to pan · z toggle zoom · e export · 0 reset · showing {visible.length} / {lines.length}
        </Text>
      </Box>
      {cycleInfo.hasCycle ? <Warning message={`Cycles detected: ${cycleInfo.cycles.map((c) => c.join('→')).join('; ')}`} /> : null}
      {visible.length === 0 ? (
        <Text dimColor>No graph data</Text>
      ) : (
        visible.map((line, idx) => <Text key={`${offset}-${idx}`}>{line}</Text>)
      )}
    </Box>
  );
};

export default DependencyGraph;
