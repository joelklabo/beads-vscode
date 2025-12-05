import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useFocus, useInput } from 'ink';
import type { Key } from 'ink';
import type { BeadItemData } from '@beads/core';
import Core from '@beads/core';
import type { BeadsViewModel } from '@beads/ui-headless';
import { defaultInkTheme, InkThemeTokens, resolveStatusColor } from '../theme/tokens';

export interface BeadListProps {
  view: BeadsViewModel;
  tokens?: InkThemeTokens;
  autoFocus?: boolean;
  favoriteIds?: Set<string>;
  emptyMessage?: string;
  errorMessage?: string;
  onSelect?: (item: BeadItemData) => void;
  onActivate?: (item: BeadItemData) => void;
}

export const BeadList: React.FC<BeadListProps> = ({
  view,
  tokens = defaultInkTheme,
  autoFocus,
  favoriteIds,
  emptyMessage = 'No beads found.',
  errorMessage,
  onSelect,
  onActivate,
}) => {
  const items = view.items ?? [];
  const cursorRef = useRef(0);
  const staleIds = useMemo(() => new Set(view.stale?.map((item) => item.id)), [view.stale]);
  const [cursor, setCursor] = useState(0);
  const { isFocused } = useFocus({ autoFocus });

  useEffect(() => {
    if (cursor >= items.length) {
      setCursor(items.length > 0 ? items.length - 1 : 0);
    }
  }, [items.length, cursor]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (items[cursor]) {
      onSelect?.(items[cursor]);
    }
  }, [cursor, items, onSelect]);

  useInput(
    (input: string, key: Key) => {
      if (!isFocused || items.length === 0) {
        return;
      }

      if (key.downArrow || input === 'j') {
        setCursor((prev) => {
          const next = (prev + 1) % items.length;
          cursorRef.current = next;
          return next;
        });
        return;
      }

      if (key.upArrow || input === 'k') {
        setCursor((prev) => {
          const next = (prev - 1 + items.length) % items.length;
          cursorRef.current = next;
          return next;
        });
        return;
      }

      if (key.return || input === ' ') {
        const current = items[cursorRef.current] ?? items[cursor];
        if (current) {
          onActivate?.(current);
        }
        return;
      }

      if (input?.toLowerCase() === 'r') {
        void view.refresh();
      }
    },
    { isActive: isFocused }
  );

  const renderRow = (item: BeadItemData, index: number): React.ReactElement => {
    const selected = index === cursor && isFocused;
    const status = item.status ?? 'open';
    const statusColor = resolveStatusColor(status, tokens) ?? tokens.status.default;
    const staleInfo = staleIds.has(item.id) ? Core.getStaleInfo(item) : undefined;
    const caret = selected ? tokens.selection.caret : ' ';
    const caretColor = selected ? tokens.selection.caretColor : tokens.muted;
    const favoriteMark = favoriteIds?.has(item.id) ? '*' : '';

    return (
      <Box key={item.id} flexDirection="row">
        <Text color={caretColor}>{caret}</Text>
        <Text color={tokens.accent}>{item.id}</Text>
        <Text> </Text>
        <Text>{item.title || '(untitled)'}</Text>
        <Text> </Text>
        <Text color={statusColor}>[{status}]</Text>
        {favoriteMark ? (
          <Text color={tokens.favorite}>
            {' '}
            {favoriteMark}
          </Text>
        ) : null}
        {staleInfo ? (
          <Text color={tokens.warning}>
            {' '}
            !stale {staleInfo.formattedTime}
          </Text>
        ) : null}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {errorMessage ? <Text color={tokens.danger}>! {errorMessage}</Text> : null}
      {view.loading ? <Text color={tokens.muted}>Refreshing...</Text> : null}
      {items.length === 0 ? <Text color={tokens.muted}>{emptyMessage}</Text> : items.map(renderRow)}
    </Box>
  );
};
