import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { BeadDetailModel } from '@beads/ui-headless';
import { defaultInkTheme, InkThemeTokens, resolveStatusColor } from '../theme/tokens';

export interface BeadDetailProps {
  model: BeadDetailModel;
  tokens?: InkThemeTokens;
  showDescription?: boolean;
  errorMessage?: string;
}

export const BeadDetail: React.FC<BeadDetailProps> = ({ model, tokens = defaultInkTheme, showDescription = false, errorMessage }) => {
  const bead = model.bead;
  const byId = useMemo(() => new Map(model.snapshot.items.map((item) => [item.id, item])), [model.snapshot.items]);

  if (errorMessage) {
    return <Text color={tokens.danger}>! {errorMessage}</Text>;
  }

  if (!bead) {
    return <Text color={tokens.muted}>Bead not found.</Text>;
  }

  const statusColor = resolveStatusColor(bead.status, tokens);
  const tagLine = (bead.tags ?? []).join(', ');
  const assignee = bead.assignee ? ` - ${bead.assignee}` : '';

  const renderEdge = (direction: 'up' | 'down') => (edge: any) => {
    const id = direction === 'up' ? edge.sourceId : edge.targetId;
    const title = direction === 'up' ? edge.sourceTitle : edge.targetTitle;
    const status = id ? byId.get(id)?.status : undefined;
    const resolvedColor = resolveStatusColor(status, tokens);
    const label = direction === 'up' ? 'upstream' : 'downstream';

    return (
      <Box key={`${label}:${id}`} flexDirection="row">
        <Text color={tokens.graph.edge}>{label}:</Text>
        <Text> {id}</Text>
        {title ? (
          <Text>
            {' '}
            {title}
          </Text>
        ) : null}
        {edge.type ? (
          <Text color={tokens.muted}>
            {' '}
            ({edge.type})
          </Text>
        ) : null}
        <Text color={resolvedColor}>
          {' '}
          [{status ?? 'unknown'}]
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={tokens.accent}>{bead.id}</Text>
        <Text> {bead.title || '(untitled)'}</Text>
        <Text color={statusColor}>
          {' '}
          [{bead.status ?? 'open'}]
        </Text>
        {assignee ? <Text color={tokens.muted}>{assignee}</Text> : null}
      </Box>
      {tagLine ? <Text color={tokens.muted}>tags: {tagLine}</Text> : null}
      {showDescription && bead.description ? <Text>{bead.description}</Text> : null}
      {model.upstream?.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={tokens.graph.edge}>Upstream</Text>
          {model.upstream.map(renderEdge('up'))}
        </Box>
      ) : null}
      {model.downstream?.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={tokens.graph.edge}>Downstream</Text>
          {model.downstream.map(renderEdge('down'))}
        </Box>
      ) : null}
    </Box>
  );
};
