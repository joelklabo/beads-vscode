import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  currentWorktreeId,
  filterStaleEntries,
  formatWorktreeLabel,
  WorktreeEntry,
  registryPath,
  writeRegistry,
  readRegistry,
} from '../../worktree';

describe('worktree helpers', () => {
  it('formats worktree labels with branch when present', () => {
    const entry: WorktreeEntry = {
      id: 'Marvin/beady-123',
      path: '/tmp/worktrees/Marvin/beady-123',
      branch: 'Marvin/beady-123',
      lastSeen: Date.now()
    };
    assert.strictEqual(formatWorktreeLabel(entry), 'Marvin/beady-123 (Marvin/beady-123)');
  });

  it('filters stale entries based on timestamp', () => {
    const now = Date.now();
    const fresh = { id: 'a', path: '/tmp/a', branch: 'a', lastSeen: now };
    const stale = { id: 'b', path: '/tmp/b', branch: 'b', lastSeen: now - 10_000 };
    const result = filterStaleEntries([fresh, stale] as WorktreeEntry[], 5_000);
    assert.deepStrictEqual(result.map(e => e.id), ['a']);
  });

  it('derives currentWorktreeId from canonical path', () => {
    const id = currentWorktreeId('/Users/me/code/worktrees/Marvin/beady-xyz');
    assert.strictEqual(id, 'Marvin/beady-xyz');
    assert.strictEqual(currentWorktreeId('/Users/me/code/beady'), undefined);
  });

  it('writes and reads registry atomically', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-reg-'));
    const reg = {
      entries: [{
        id: 'worker/task',
        path: path.join(tmp, 'worktrees/worker/task'),
        branch: 'worker/task',
        lastSeen: Date.now(),
      }],
      schemaVersion: 1,
      generatedAt: Date.now(),
    };
    writeRegistry(tmp, reg);
    const saved = readRegistry(tmp);
    assert.ok(saved);
    assert.ok(saved?.entries[0], 'Registry should contain one entry');
    assert.strictEqual(saved?.entries[0]?.id, 'worker/task');
    assert.strictEqual(registryPath(tmp).startsWith(tmp), true);
  });

});
