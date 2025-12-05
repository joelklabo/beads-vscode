import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { BeadItemData } from '@beads/core';

interface Props {
  items: BeadItemData[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

const statusColor = (status?: string): string => {
  switch (status) {
    case 'in_progress':
      return 'yellow';
    case 'blocked':
      return 'red';
    case 'closed':
      return 'green';
    default:
      return 'cyan';
  }
};

export const BeadList: React.FC<Props> = ({ items, selectedId, onSelect, loading }) => {
  const [cursor, setCursor] = useState(0);
  const rows = useMemo(() => items, [items]);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow || input === 'j') setCursor((c) => Math.min(rows.length - 1, c + 1));
    if (key.return && rows[cursor]) onSelect(rows[cursor].id);
  });

  const activeId = selectedId ?? rows[cursor]?.id;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text color="cyan">Issues</Text>
        <Text dimColor>{loading ? 'Loading…' : `${rows.length} items`}</Text>
      </Box>
      {rows.length === 0 ? (
        <Text dimColor>No issues loaded.</Text>
      ) : (
        rows.map((item, index) => {
          const isActive = activeId === item.id || cursor === index;
          return (
            <Box key={item.id} flexDirection="column">
              <Text inverse={isActive}>
                {isActive ? '▶ ' : '  '}
                <Text color={statusColor(item.status)}>{item.id}</Text>
                <Text> · </Text>
                {item.title || 'Untitled'}
              </Text>
              {item.description ? (
                <Text dimColor wrap="truncate-end">
                  {item.description}
                </Text>
              ) : null}
            </Box>
          );
        })
      )}
    </Box>
  );
};

export default BeadList;
