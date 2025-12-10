import { BeadItemData } from './beads';
import { DependencyDirection, DependencyLink, DependencyType, extractDependencyLinks } from './dependencies';

export interface DependencyTreeStrings {
  title: string;
  resetView: string;
  autoLayout: string;
  removeDependencyLabel: string;
  legendClosed: string;
  legendInProgress: string;
  legendOpen: string;
  legendBlocked: string;
  emptyTitle: string;
  emptyDescription: string;
  renderErrorTitle: string;
}

export interface GraphNodeData {
  id: string;
  title?: string;
  status?: string;
}

export interface GraphEdgeData {
  sourceId: string;
  targetId: string;
  type?: string;
  sourceTitle?: string;
  targetTitle?: string;
}

export interface DependencyNeighbor {
  id: string;
  title?: string;
  status?: string;
  type: DependencyType;
  direction: DependencyDirection;
  missing?: boolean;
  externalReferenceId?: string;
  externalReferenceDescription?: string;
}

export interface DependencyTreeNode extends DependencyNeighbor {
  children: DependencyTreeNode[];
}

export interface DependencyTrees {
  upstream: DependencyTreeNode[];
  downstream: DependencyTreeNode[];
}

export interface DependencyAdjacency {
  upstream: DependencyNeighbor[];
  downstream: DependencyNeighbor[];
}

export function collectDependencyEdges(items: BeadItemData[] | undefined): GraphEdgeData[] {
  if (!items || items.length === 0) {
    return [];
  }

  const nodeTitles = new Map<string, string>();
  items.forEach((item) => nodeTitles.set(item.id, item.title || item.id));

  const edges: GraphEdgeData[] = [];

  items.forEach((item) => {
    const deps = extractDependencyLinks(item.raw);
    deps.forEach((dep) => {
      edges.push({
        sourceId: item.id,
        targetId: dep.id,
        type: dep.type,
        sourceTitle: item.title,
        targetTitle: nodeTitles.get(dep.id),
      });
    });
  });

  return edges;
}

export function mapBeadsToGraphNodes(items: BeadItemData[] | undefined): GraphNodeData[] {
  if (!items || items.length === 0) {
    return [];
  }
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status || 'open',
  }));
}

function buildDependencyIndex(items: BeadItemData[] | undefined) {
  const itemById = new Map<string, BeadItemData>();
  const upstreamById = new Map<string, DependencyLink[]>();
  const downstreamById = new Map<string, DependencyLink[]>();

  if (!items) {
    return { itemById, upstreamById, downstreamById };
  }

  for (const item of items) {
    if (!item?.id) {
      continue;
    }
    itemById.set(item.id, item);

    const links = extractDependencyLinks(item.raw);
    if (links.length > 0) {
      upstreamById.set(item.id, links);
    }

    for (const link of links) {
      const dependents = downstreamById.get(link.id) ?? [];
      dependents.push({ id: item.id, type: link.type });
      downstreamById.set(link.id, dependents);
    }
  }

  return { itemById, upstreamById, downstreamById };
}

function linksToNeighbors(
  links: DependencyLink[] | undefined,
  direction: DependencyDirection,
  index: ReturnType<typeof buildDependencyIndex>
): DependencyNeighbor[] {
  if (!links || links.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const neighbors: DependencyNeighbor[] = [];

  for (const link of links) {
    if (seen.has(link.id)) {
      continue;
    }
    seen.add(link.id);

    const match = index.itemById.get(link.id);
    neighbors.push({
      id: link.id,
      title: match?.title,
      status: match?.status,
      type: link.type,
      direction,
      missing: !match,
      externalReferenceId: match?.externalReferenceId,
      externalReferenceDescription: match?.externalReferenceDescription,
    });
  }

  return neighbors;
}

export function buildDependencyAdjacency(items: BeadItemData[] | undefined, rootId: string): DependencyAdjacency {
  const index = buildDependencyIndex(items);
  return {
    upstream: linksToNeighbors(index.upstreamById.get(rootId), 'upstream', index),
    downstream: linksToNeighbors(index.downstreamById.get(rootId), 'downstream', index),
  };
}

function buildBranch(
  currentId: string,
  direction: DependencyDirection,
  index: ReturnType<typeof buildDependencyIndex>,
  visited: Set<string>
): DependencyTreeNode[] {
  const links =
    direction === 'upstream'
      ? index.upstreamById.get(currentId) ?? []
      : index.downstreamById.get(currentId) ?? [];

  const seen = new Set<string>();
  const nodes: DependencyTreeNode[] = [];

  for (const link of links) {
    if (seen.has(link.id)) {
      continue;
    }
    seen.add(link.id);

    const match = index.itemById.get(link.id);
    const node: DependencyTreeNode = {
      id: link.id,
      title: match?.title,
      status: match?.status,
      type: link.type,
      direction,
      missing: !match,
      externalReferenceId: match?.externalReferenceId,
      externalReferenceDescription: match?.externalReferenceDescription,
      children: [],
    };

    if (!visited.has(link.id)) {
      const nextVisited = new Set(visited);
      nextVisited.add(link.id);
      node.children = buildBranch(link.id, direction, index, nextVisited);
    }

    nodes.push(node);
  }

  return nodes;
}

export function buildDependencyTrees(items: BeadItemData[] | undefined, rootId: string): DependencyTrees {
  const index = buildDependencyIndex(items);
  const upstreamVisited = new Set<string>([rootId]);
  const downstreamVisited = new Set<string>([rootId]);

  return {
    upstream: buildBranch(rootId, 'upstream', index, upstreamVisited),
    downstream: buildBranch(rootId, 'downstream', index, downstreamVisited),
  };
}

export function willCreateDependencyCycle(
  edges: GraphEdgeData[],
  sourceId: string,
  targetId: string
): boolean {
  const adjacency = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!adjacency.has(from)) {
      adjacency.set(from, new Set());
    }
    adjacency.get(from)!.add(to);
  };

  edges.forEach((edge) => addEdge(edge.sourceId, edge.targetId));
  addEdge(sourceId, targetId);

  const stack: string[] = [targetId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const neighbors = adjacency.get(current);
    if (neighbors) {
      neighbors.forEach((n) => {
        if (!visited.has(n)) {
          stack.push(n);
        }
      });
    }
  }

  return false;
}

export function validateEdgeAddition(
  edges: GraphEdgeData[],
  sourceId: string,
  targetId: string
): { valid: boolean; reason?: string } {
  if (!sourceId || !targetId) {
    return { valid: false, reason: 'missing_ids' };
  }

  if (sourceId === targetId) {
    return { valid: false, reason: 'self_cycle' };
  }

  if (edges.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId)) {
    return { valid: false, reason: 'duplicate' };
  }

  if (willCreateDependencyCycle(edges, sourceId, targetId)) {
    return { valid: false, reason: 'cycle' };
  }

  return { valid: true };
}
