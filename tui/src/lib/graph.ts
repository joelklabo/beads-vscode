import { GraphEdgeData, GraphNodeData } from '@beads/core';

export type { GraphNodeData as GraphNode, GraphEdgeData as GraphEdge };

export interface GraphFilter {
  query?: string;
  focusId?: string;
}

export interface CycleResult {
  hasCycle: boolean;
  cycles: string[][];
}

/**
 * Build a simple adjacency map for dependency edges.
 */
const adjacencyFromEdges = (edges: GraphEdgeData[]): Map<string, string[]> => {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const from = edge.sourceId;
    const to = edge.targetId;
    adj.set(from, [...(adj.get(from) ?? []), to]);
  }
  return adj;
};

export const detectCycles = (edges: GraphEdgeData[]): CycleResult => {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const adj = adjacencyFromEdges(edges);
  const cycles: string[][] = [];

  const dfs = (node: string, path: string[]): void => {
    if (stack.has(node)) {
      const start = path.indexOf(node);
      cycles.push(path.slice(start));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const next of adj.get(node) ?? []) {
      dfs(next, [...path, next]);
    }
    stack.delete(node);
  };

  for (const from of adj.keys()) {
    dfs(from, [from]);
  }

  return { hasCycle: cycles.length > 0, cycles };
};

export const filterGraph = (
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  filter: GraphFilter = {}
): { nodes: GraphNodeData[]; edges: GraphEdgeData[] } => {
  if (!filter.query && !filter.focusId) return { nodes, edges };

  const query = filter.query?.toLowerCase();
  const allowed = new Set<string>();

  for (const node of nodes) {
    const hay = `${node.id} ${node.title ?? ''}`.toLowerCase();
    if ((query && hay.includes(query)) || (filter.focusId && node.id === filter.focusId)) {
      allowed.add(node.id);
    }
  }

  const filteredNodes = nodes.filter((n) => allowed.size === 0 || allowed.has(n.id));
  const filteredSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => filteredSet.has(e.sourceId) && filteredSet.has(e.targetId));

  return { nodes: filteredNodes, edges: filteredEdges };
};

const indentLine = (text: string, depth: number): string => `${'  '.repeat(depth)}${text}`;

/**
 * Render a simple tree-ish text layout based on dependency edges.
 * Prefers roots (nodes with no incoming edges) and truncates lines to maxWidth.
 */
export const layoutGraph = (
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  maxWidth = 80
): string[] => {
  const children = new Map<string, string[]>();
  const parentCounts = new Map<string, number>();
  for (const edge of edges) {
    children.set(edge.sourceId, [...(children.get(edge.sourceId) ?? []), edge.targetId]);
    parentCounts.set(edge.targetId, (parentCounts.get(edge.targetId) ?? 0) + 1);
  }
  const roots = nodes.filter((n) => !parentCounts.has(n.id)).map((n) => n.id);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const lines: string[] = [];
  const seen = new Set<string>();

  const render = (id: string, depth: number): void => {
    if (seen.has(id)) {
      lines.push(indentLine(`↪ ${id} (revisit)`, depth).slice(0, maxWidth));
      return;
    }
    seen.add(id);
    const label = nodeMap.get(id)?.title ? `${id}: ${nodeMap.get(id)?.title}` : id;
    lines.push(indentLine(`• ${label}`, depth).slice(0, maxWidth));
    for (const child of children.get(id) ?? []) {
      render(child, depth + 1);
    }
  };

  if (roots.length === 0 && nodes.length > 0) {
    render(nodes[0].id, 0);
  } else {
    for (const root of roots) {
      render(root, 0);
    }
  }

  return lines;
};

export const exportAsText = (lines: string[]): string => lines.join('\n');
