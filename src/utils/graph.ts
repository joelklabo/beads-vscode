import { BeadItemData } from './beads';

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

export function collectDependencyEdges(items: BeadItemData[] | undefined): GraphEdgeData[] {
  if (!items || items.length === 0) {
    return [];
  }

  const nodeTitles = new Map<string, string>();
  items.forEach((item) => nodeTitles.set(item.id, item.title || item.id));

  const edges: GraphEdgeData[] = [];

  items.forEach((item) => {
    const deps = (item.raw as any)?.dependencies || [];
    deps.forEach((dep: any) => {
      const targetId = dep.id || dep.depends_on_id || dep.issue_id;
      if (!targetId) {
        return;
      }

      const type = dep.dep_type || dep.type || 'related';
      edges.push({
        sourceId: item.id,
        targetId,
        type,
        sourceTitle: item.title,
        targetTitle: nodeTitles.get(targetId),
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
