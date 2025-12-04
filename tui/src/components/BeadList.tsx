// Placeholder BeadList with worktree-aware filtering/deduping helpers.
// Ink components intentionally minimal to avoid pulling React/Ink into compile.

import React from 'react';
import { filterAndDedupeActivity, ActivityRow } from '../lib/worktree';

type Props = {
  rows: ActivityRow[];
  worktreeFilter?: string;
  renderItem?: (row: ActivityRow) => React.ReactNode;
};

export const BeadList: React.FC<Props> = ({ rows, worktreeFilter, renderItem }) => {
  const items = filterAndDedupeActivity(rows, worktreeFilter);
  if (!renderItem) {
    // Fallback: render a simple text list (safe for tests/dry runs)
    return React.createElement(
      'div',
      null,
      items.map((row) =>
        React.createElement('div', { key: `${row.worktreeId || 'main'}:${row.id}` }, `${row.id} (${row.worktreeId ?? 'main'})`)
      )
    );
  }
  return React.createElement(React.Fragment, null, items.map((row) => renderItem(row)));
};

export default BeadList;
