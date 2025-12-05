import * as assert from 'assert';
import Module = require('module');
import { syncFavoritesState } from '../utils/favorites';
import { BeadItemData } from '../utils/beads';

function createContext(seed: string[] = []) {
  const store = new Map<string, any>([['beads.favorites.local', seed]]);
  return {
    workspaceState: {
      get: (key: string, fallback?: any) => store.has(key) ? store.get(key) : fallback,
      update: (key: string, value: any) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
        return Promise.resolve();
      },
    },
    _store: store,
  } as any;
}

describe('favorites persistence and sync', () => {
  let restoreLoad: any;

  beforeEach(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return {};
      }
      return restoreLoad(request, parent, isMain);
    };
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('syncs favorites from labels when label storage is enabled', async () => {
    const context = createContext();
    const items: BeadItemData[] = [
      { id: 'A-1', title: 'A', raw: { labels: ['favorite'] } },
      { id: 'B-2', title: 'B', raw: { labels: [] } },
    ];

    const synced = await syncFavoritesState({
      context,
      items,
      favoriteLabel: 'favorite',
      useLabelStorage: true,
    });

    assert.deepStrictEqual(Array.from(synced).sort(), ['A-1']);
    assert.deepStrictEqual(context._store.get('beads.favorites.local'), ['A-1']);
  });

  it('preserves local favorites when label storage is disabled', async () => {
    const context = createContext(['LOCAL-1']);
    const items: BeadItemData[] = [
      { id: 'A-1', title: 'A', raw: { labels: ['favorite'] } },
    ];

    const synced = await syncFavoritesState({
      context,
      items,
      favoriteLabel: 'favorite',
      useLabelStorage: false,
    });

    assert.deepStrictEqual(Array.from(synced), ['LOCAL-1']);
    assert.deepStrictEqual(context._store.get('beads.favorites.local'), ['LOCAL-1']);
  });

  it('drops stale local favorites when labels no longer contain them', async () => {
    const context = createContext(['STALE', 'KEEP']);
    const items: BeadItemData[] = [
      { id: 'KEEP', title: 'Keep', raw: { labels: ['favorite'] } },
    ];

    const synced = await syncFavoritesState({
      context,
      items,
      favoriteLabel: 'favorite',
      useLabelStorage: true,
    });

    assert.deepStrictEqual(Array.from(synced), ['KEEP']);
    assert.deepStrictEqual(context._store.get('beads.favorites.local'), ['KEEP']);
  });
});
