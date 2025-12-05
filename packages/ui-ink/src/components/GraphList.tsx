import React from 'react';
import { Box, Text } from 'ink';
import type { GraphViewModel } from '@beads/ui-headless';
import { defaultInkTheme, InkThemeTokens } from '../theme/tokens';

export interface GraphListProps {
  graph: GraphViewModel;
  tokens?: InkThemeTokens;
  maxEdgesToShow?: number;
}

export const GraphList: React.FC<GraphListProps> = ({ graph, tokens = defaultInkTheme, maxEdgesToShow = 25 }) => {
  const edges = graph.edges ?? [];
  const nodes = graph.nodes ?? [];
  const limitedEdges = edges.slice(0, maxEdgesToShow);

  return (
    <Box flexDirection="column">
      <Text color={tokens.graph.node}>Nodes: {nodes.length}</Text>
      <Text color={tokens.graph.edge}>Edges: {edges.length}</Text>
      {edges.length === 0 ? (
        <Text color={tokens.muted}>No dependency edges to show.</Text>
      ) : null}
      {limitedEdges.map((edge) => (
        <Text key={`${edge.sourceId}->${edge.targetId}`}>
          <Text color={tokens.graph.node}>{edge.sourceId}</Text>
          <Text color={tokens.graph.edge}>{' -> '}</Text>
          <Text color={tokens.graph.node}>{edge.targetId}</Text>
          {edge.type ? (
            <Text color={tokens.muted}>
              {' '}
              ({edge.type})
            </Text>
          ) : null}
        </Text>
      ))}
      {edges.length > maxEdgesToShow ? (
        <Text color={tokens.muted}>Showing first {maxEdgesToShow} edges.</Text>
      ) : null}
    </Box>
  );
};
