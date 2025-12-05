import React from 'react';
import { ThemeTokens, lightTokens } from '../theme/tokens';

export interface FavoritesBadgeProps {
  count: number;
  tokens?: ThemeTokens;
}

export const FavoritesBadge: React.FC<FavoritesBadgeProps> = ({ count, tokens = lightTokens }) => {
  return (
    <span
      aria-label={`favorites-count-${count}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 12,
        border: `1px solid ${tokens.border}`,
        background: tokens.surface,
        color: tokens.text,
        fontWeight: 600,
      }}
    >
      ★
      <span>{count}</span>
    </span>
  );
};
