import React from 'react';
import { Box, Text } from 'ink';
import { BeadItemData } from '@beads/core';
import type { StoreState } from '@beads/ui-headless';
import { defaultInkTheme, InkThemeTokens } from '../theme/tokens';

export interface StatusBarProps {
  view: StoreState & { loading?: boolean; stale?: BeadItemData[] };
  tokens?: InkThemeTokens;
  message?: string;
  errorMessage?: string;
  favoriteIds?: Set<string>;
}

export const StatusBar: React.FC<StatusBarProps> = ({ view, tokens = defaultInkTheme, message, errorMessage, favoriteIds }) => {
  const items = view.snapshot.items ?? [];
  const total = items.length;
  const inProgress = items.filter((item) => item.status === 'in_progress').length;
  const blocked = items.filter((item) => (item.blockingDepsCount ?? 0) > 0).length;
  const staleCount = view.stale?.length ?? 0;
  const favorites = favoriteIds?.size ?? 0;

  return (
    <Box flexDirection="row">
      {errorMessage ? (
        <Text color={tokens.danger}>! {errorMessage} </Text>
      ) : null}
      {message ? <Text>{message} </Text> : null}
      {view.loading ? <Text color={tokens.muted}>Refreshing... </Text> : null}
      <Text color={tokens.accent}>Total {total}</Text>
      <Text color={tokens.status.in_progress}> | In progress {inProgress}</Text>
      <Text color={tokens.status.blocked}> | Blocked {blocked}</Text>
      <Text color={tokens.warning}> | Stale {staleCount}</Text>
      {favorites ? <Text color={tokens.favorite}> | Favorites {favorites}</Text> : null}
    </Box>
  );
};
