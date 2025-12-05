import { useCallback, useEffect, useMemo, useState } from 'react';
import { BeadsStore, BeadsStoreOptions, BeadsStoreSnapshot, WorkspaceTarget } from '@beads/core';

export interface UseStoreOptions extends BeadsStoreOptions {
  workspaces: WorkspaceTarget[];
  store?: BeadsStore;
}

export interface StoreState {
  snapshot: BeadsStoreSnapshot;
  refresh: () => Promise<BeadsStoreSnapshot>;
  store: BeadsStore;
}

export function useStoreSnapshot(options: UseStoreOptions): StoreState {
  const store = useMemo(() => options.store ?? new BeadsStore(options), [options.store, options.watchAdapter, options.watchManager, options.watchDebounceMs]);
  const [snapshot, setSnapshot] = useState<BeadsStoreSnapshot>(() => store.getSnapshot());

  useEffect(() => {
    return store.onDidChange((next) => setSnapshot(next));
  }, [store]);

  useEffect(() => {
    void store.refresh(options.workspaces);
  }, [store, options.workspaces]);

  const refresh = useCallback(() => store.refresh(options.workspaces), [store, options.workspaces]);

  return { snapshot, refresh, store };
}
