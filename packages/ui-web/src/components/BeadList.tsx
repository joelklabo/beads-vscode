import React from 'react';
import { ThemeTokens, lightTokens } from '../theme/tokens';

export interface BeadListItem {
  id: string;
  title: string;
  status?: string;
  tags?: string[];
  favorite?: boolean;
}

export interface BeadListProps {
  items: BeadListItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  tokens?: ThemeTokens;
}

export const BeadList: React.FC<BeadListProps> = ({ items, selectedId, onSelect, onToggleFavorite, tokens = lightTokens }) => {
  return (
    <div role="list" aria-label="Bead list" style={{ background: tokens.background, color: tokens.text }}>
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <div
            key={item.id}
            role="listitem"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect?.(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(item.id);
              }
            }}
            style={{
              border: `1px solid ${tokens.border}`,
              background: selected ? tokens.surface : 'transparent',
              outline: selected ? `2px solid ${tokens.focusOutline}` : 'none',
              padding: '8px',
              marginBottom: 4,
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ color: tokens.muted, fontSize: 12 }}>{item.status ?? 'open'}</div>
              {item.tags && item.tags.length > 0 && (
                <div aria-label="tags" style={{ color: tokens.accent, fontSize: 12 }}>
                  {item.tags.join(', ')}
                </div>
              )}
            </div>
            {onToggleFavorite && (
              <button
                aria-pressed={item.favorite}
                aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(item.id);
                }}
                style={{
                  border: `1px solid ${tokens.border}`,
                  background: item.favorite ? tokens.accent : tokens.surface,
                  color: tokens.text,
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {item.favorite ? '★' : '☆'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
