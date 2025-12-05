import React from 'react';
import { BeadItemData } from '@beads/core';

interface Props {
  items: BeadItemData[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function BeadList({ items, selectedId, onSelect, loading }: Props): JSX.Element {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Beads</div>
          <div className="panel-subtitle">{items.length} items</div>
        </div>
        <div className="pill">{loading ? 'Loading…' : 'Ready'}</div>
      </div>
      <ul className="bead-list" role="listbox" aria-label="Beads">
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id} className={selected ? 'selected' : ''}>
              <button
                className="bead-row"
                onClick={() => onSelect(item.id)}
                aria-pressed={selected}
                aria-label={`${item.id} ${item.title}`}
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
