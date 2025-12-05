import * as assert from 'assert';
import { BeadsStore, WatchAdapter, WatchEvent } from '@beads/core';

class StubWatchAdapter implements WatchAdapter {
  public watchers: Array<{ target: string; listener: (event: WatchEvent, target: string) => void; disposed: boolean }> = [];
  public disposeCount = 0;

  watch(targetPath: string, listener: (event: WatchEvent, target: string) => void) {
    const entry = { target: targetPath, listener, disposed: false };
    this.watchers.push(entry);
    return {
      dispose: () => {
        if (!entry.disposed) {
          entry.disposed = true;
          this.disposeCount += 1;
        }
      },
    };
  }

  emit(targetPath: string, event: WatchEvent = 'change') {
    for (const watcher of this.watchers) {
      if (!watcher.disposed && watcher.target === targetPath) {
        watcher.listener(event, targetPath);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('BeadsStore', () => {
  it('loads and sorts items across workspaces', async () => {
    const adapter = new StubWatchAdapter();
    const store = new BeadsStore({
      watchAdapter: adapter,
      loader: async (target) => ({
        items: [
          { id: 'B10', title: 'later', status: 'open' } as any,
          { id: 'B2', title: 'earlier', status: 'open' } as any,
        ],
        document: { filePath: `${target.root}/.beads`, root: [], beads: [], watchPaths: [`${target.root}/.beads`] },
      }),
    });

    const snapshot = await store.refresh([{ id: 'ws1', root: '/tmp/ws1' }]);
    assert.strictEqual(snapshot.items[0].id, 'B2');
    assert.strictEqual(snapshot.items[1].id, 'B10');
  });

  it('debounces watch-triggered refreshes', async () => {
    const adapter = new StubWatchAdapter();
    let loadCount = 0;
    const store = new BeadsStore({
      watchAdapter: adapter,
      watchDebounceMs: 5,
      loader: async (target) => {
        loadCount += 1;
        return {
          items: [{ id: `A${loadCount}`, title: 'item' } as any],
          document: { filePath: `${target.root}/.beads`, root: [], beads: [], watchPaths: [`${target.root}/.beads`] },
        };
      },
    });

    await store.refresh([{ id: 'ws', root: '/tmp/ws' }]);
    adapter.emit('/tmp/ws/.beads', 'change');
    adapter.emit('/tmp/ws/.beads', 'create');

    await delay(20);

    assert.strictEqual(loadCount, 2, 'should coalesce multiple watch events into one refresh');
  });

  it('computes stale items with injected clock', async () => {
    const adapter = new StubWatchAdapter();
    const now = Date.now();
    const inProgressSince = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const store = new BeadsStore({
      watchAdapter: adapter,
      clock: () => now,
      staleThresholdHours: 1,
      loader: async (target) => ({
        items: [{ id: 'stale', status: 'in_progress', inProgressSince } as any],
        document: { filePath: `${target.root}/.beads`, root: [], beads: [], watchPaths: [`${target.root}/.beads`] },
      }),
    });

    await store.refresh([{ id: 'ws', root: '/tmp/ws' }]);
    const stale = store.getStaleItems();
    assert.strictEqual(stale.length, 1);
    assert.strictEqual(stale[0].id, 'stale');
  });

  it('disposes watchers on teardown', async () => {
    const adapter = new StubWatchAdapter();
    const store = new BeadsStore({
      watchAdapter: adapter,
      loader: async (target) => ({
        items: [{ id: 'x', title: 'x' } as any],
        document: { filePath: `${target.root}/.beads`, root: [], beads: [], watchPaths: [`${target.root}/.beads`] },
      }),
    });

    await store.refresh([{ id: 'ws', root: '/tmp/ws' }]);
    assert.strictEqual(adapter.watchers.length, 1);

    store.dispose();
    assert.strictEqual(adapter.disposeCount, 1);
  });
});
