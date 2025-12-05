import React, { useEffect, useMemo, useRef } from 'react';
import { BeadItemData } from '@beads/core';

interface Props {
  items: BeadItemData[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function BeadList({ items, selectedId, onSelect, loading }: Props): JSX.Element {
  const listRef = useRef<HTMLUListElement | null>(null);

  const activeId = useMemo(() => selectedId ?? items[0]?.id, [items, selectedId]);

  useEffect(() => {
    if (!activeId || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLButtonElement>(`#bead-${activeId}`);
    node?.focus();
  }, [activeId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (!items.length) return;
    const currentIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
    const clamp = (idx: number): number => Math.min(Math.max(idx, 0), items.length - 1);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = clamp(currentIndex + 1);
      onSelect(items[nextIndex].id);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = clamp(currentIndex - 1);
      onSelect(items[nextIndex].id);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onSelect(items[0].id);
    }

    if (event.key === 'End') {
      event.preventDefault();
      onSelect(items[items.length - 1].id);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Beads</div>
          <div className="panel-subtitle">{items.length} items</div>
        </div>
        <div className="pill">{loading ? 'Loading…' : 'Ready'}</div>
      </div>
      <ul
        className="bead-list"
        role="listbox"
        aria-label="Beads"
        aria-busy={loading}
        aria-activedescendant={activeId ? `bead-${activeId}` : undefined}
        tabIndex={0}
        ref={listRef}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id} className={selected ? 'selected' : ''}>
              <button
                id={`bead-${item.id}`}
                className="bead-row"
                onClick={() => onSelect(item.id)}
                role="option"
                aria-selected={selected}
                aria-pressed={selected}
                tabIndex={selected ? 0 : -1}
                aria-label={`${item.id} ${item.title} status ${item.status || 'open'} priority ${item.priority ?? 4}`}
              >
                <div className="bead-row-header">
                  <span className="bead-id">{item.id}</span>
                  <span className={`status status-${item.status || 'open'}`}>{item.status || 'open'}</span>
                </div>
                <div className="bead-title">{item.title || 'Untitled'}</div>
                <div className="bead-meta">Priority P{item.priority ?? 4}</div>
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="empty">No beads to display.</li>}
      </ul>
    </div>
  );
}

export default BeadList;
