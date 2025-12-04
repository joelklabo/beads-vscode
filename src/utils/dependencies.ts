import { BeadItemData } from './beads';

function extractDependencyIds(raw: any): string[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const deps = raw.dependencies || [];
  return deps
    .map((dep: any) => dep?.depends_on_id || dep?.id || dep?.issue_id)
    .filter((id: string | undefined) => typeof id === 'string' && id.length > 0);
}

/**
 * Return true when a dependency edge already exists from source -> target.
 */
export function hasDependency(items: BeadItemData[], sourceId: string, targetId: string): boolean {
  const source = items.find((i) => i.id === sourceId);
  if (!source || !source.raw) {
    return false;
  }
  return extractDependencyIds(source.raw).includes(targetId);
}

/**
 * DFS to detect a path from fromId to toId using current dependency edges.
 */
export function hasDependencyPath(items: BeadItemData[], fromId: string, toId: string, visited = new Set<string>()): boolean {
  if (fromId === toId) {
    return true;
  }
  if (visited.has(fromId)) {
    return false;
  }
  visited.add(fromId);

  const nextIds = extractDependencyIds(items.find((i) => i.id === fromId)?.raw);
  for (const next of nextIds) {
    if (hasDependencyPath(items, next, toId, visited)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate whether a dependency can be added from sourceId -> targetId.
 * Returns an error message string if invalid, otherwise undefined.
 */
export function validateDependencyAdd(items: BeadItemData[], sourceId: string, targetId: string): string | undefined {
  if (sourceId === targetId) {
    return 'Cannot create a dependency on the same issue.';
  }

  if (hasDependency(items, sourceId, targetId)) {
    return 'This dependency already exists.';
  }

  if (hasDependencyPath(items, targetId, sourceId)) {
    return 'Adding this dependency would create a cycle.';
  }

  return undefined;
}
