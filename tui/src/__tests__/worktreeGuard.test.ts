import assert from 'assert';
import { filterAndDedupeActivity } from '../lib/worktree';

describe('tui worktree helpers', () => {
  it('dedupes by worktree/id/timestamp and filters by worktree', () => {
    const rows = [
      { id: '1', worktreeId: 'w1', timestamp: 1 },
      { id: '1', worktreeId: 'w1', timestamp: 1 },
      { id: '2', worktreeId: 'w2', timestamp: 2 },
    ];
    const filtered = filterAndDedupeActivity(rows, 'w1');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, '1');
  });
});
