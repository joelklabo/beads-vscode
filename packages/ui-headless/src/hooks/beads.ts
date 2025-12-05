import { useMemo } from 'react';
import { collectDependencyEdges, mapBeadsToGraphNodes, filterBeadsByQuery, getStaleInfo, BeadItemData, BeadsStore, WorkspaceTarget, GraphEdgeData, GraphNodeData } from '@beads/core';
import { createHeadlessActions, CliAdapter, HeadlessActions } from './actions';
import { useStoreSnapshot, StoreState } from './store';

export interface UseBeadsViewOptions {
  workspaces: WorkspaceTarget[];
  query?: string;
  staleThresholdHours?: number;
  store?: BeadsStore;
}

export interface BeadsViewModel extends StoreState {
  items: BeadItemData[];
  stale: BeadItemData[];
  loading: boolean;
}

export function useBeadsView(options: UseBeadsViewOptions): BeadsViewModel {
  const storeState = useStoreSnapshot({ workspaces: options.workspaces, store: options.store });
  const items = useMemo(() => filterBeadsByQuery(storeState.snapshot.items, options.query), [storeState.snapshot.items, options.query]);
  const stale = useMemo(
    () => storeState.store.getStaleItems(options.staleThresholdHours),
    [storeState.store, storeState.snapshot.items, options.staleThresholdHours]
  );
  const loading = storeState.snapshot.workspaces.some((ws) => ws.refreshInProgress || ws.pendingRefresh);

  return {
    ...storeState,
    items,
    stale,
    loading,
  };
}

export interface UseBeadDetailOptions {
  beadId: string;
  workspaces: WorkspaceTarget[];
  store?: BeadsStore;
}

export interface BeadDetailModel extends StoreState {
  bead?: BeadItemData;
  upstream: GraphEdgeData[];
  downstream: GraphEdgeData[];
}

export function useBeadDetail(options: UseBeadDetailOptions): BeadDetailModel {
  const storeState = useStoreSnapshot({ workspaces: options.workspaces, store: options.store });
  const bead = storeState.snapshot.items.find((item) => item.id === options.beadId);
  const edges = useMemo(() => collectDependencyEdges(storeState.snapshot.items), [storeState.snapshot.items]);

  const upstream = useMemo(() => edges.filter((edge) => edge.targetId === options.beadId), [edges, options.beadId]);
  const downstream = useMemo(() => edges.filter((edge) => edge.sourceId === options.beadId), [edges, options.beadId]);

  return { ...storeState, bead, upstream, downstream };
}

export interface GraphViewModel extends StoreState {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export function useGraphData(workspaces: WorkspaceTarget[], store?: BeadsStore): GraphViewModel {
  const storeState = useStoreSnapshot({ workspaces, store });
  const nodes = useMemo(() => mapBeadsToGraphNodes(storeState.snapshot.items), [storeState.snapshot.items]);
  const edges = useMemo(() => collectDependencyEdges(storeState.snapshot.items), [storeState.snapshot.items]);
  return { ...storeState, nodes, edges };
}

export interface UseFavoritesOptions {
  favoriteLabel?: string;
  workspaces: WorkspaceTarget[];
  cliAdapter?: CliAdapter;
  store?: BeadsStore;
}

export interface FavoritesModel extends StoreState {
  favorites: Set<string>;
  toggleFavorite: (id: string) => Promise<void>;
}

export function useFavorites(options: UseFavoritesOptions): FavoritesModel {
  const storeState = useStoreSnapshot({ workspaces: options.workspaces, store: options.store });
  const label = options.favoriteLabel ?? 'favorite';
  const actions: HeadlessActions = useMemo(
    () => createHeadlessActions(options.cliAdapter, options.workspaces[0]?.root),
    [options.cliAdapter, options.workspaces]
  );

  const favorites = useMemo(() => {
    const result = new Set<string>();
    for (const item of storeState.snapshot.items) {
      const tags = (item.tags ?? item.raw?.labels ?? []) as string[];
      if (tags.some((tag) => tag === label)) {
        result.add(item.id);
      }
    }
    return result;
  }, [storeState.snapshot.items, label]);

  const toggleFavorite = async (id: string): Promise<void> => {
    await actions.toggleFavorite(id, label);
    // optimistic local toggle; refresh will reconcile
    if (favorites.has(id)) {
      favorites.delete(id);
    } else {
      favorites.add(id);
    }
  };

  return { ...storeState, favorites, toggleFavorite };
}
