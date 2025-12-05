import { BeadItemData } from './beads';

export type DependencyType = 'blocks' | 'parent-child' | 'related';
export type DependencyDirection = 'upstream' | 'downstream';

export interface DependencyLink {
  id: string;
  type: DependencyType;
}

export type DependencyValidationReason =
  | 'missing_source'
  | 'missing_target'
  | 'self'
  | 'duplicate'
  | 'cycle';

export interface DependencyValidationResult {
  ok: boolean;
  reason?: DependencyValidationReason;
}

export function normalizeDependencyType(rawType: string | undefined): DependencyType {
  const normalized = (rawType || '').toLowerCase();
  if (normalized === 'blocks' || normalized === 'block') {
    return 'blocks';
  }
  if (normalized === 'parent-child' || normalized === 'parent_child' || normalized === 'parentchild') {
    return 'parent-child';
  }
  return 'related';
}

export function extractDependencyLinks(raw: any): DependencyLink[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const deps = raw.dependencies || [];
  const links = deps.map((dep: any): DependencyLink | undefined => {
    const id = dep?.depends_on_id || dep?.id || dep?.issue_id;
    if (!id || typeof id !== 'string') {
      return undefined;
    }
    return {
      id,
      type: normalizeDependencyType(dep?.dep_type || dep?.type),
    } as DependencyLink;
  });

  return links.filter((value: DependencyLink | undefined): value is DependencyLink => Boolean(value));
}

export function extractDependencyIds(raw: any): string[] {
  return extractDependencyLinks(raw).map((dep) => dep.id);
}

/**
 * Return true when a dependency edge already exists from source -> target.
 */
export function hasDependency(items: BeadItemData[], sourceId: string, targetId: string): boolean {
  const source = items.find((i) => i.id === sourceId);
  if (!source || !source.raw) {
    return false;
  }
  return extractDependencyLinks(source.raw).some((dep) => dep.id === targetId);
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

  const nextIds = extractDependencyLinks(items.find((i) => i.id === fromId)?.raw).map((dep) => dep.id);
  for (const next of nextIds) {
    if (hasDependencyPath(items, next, toId, visited)) {
      return true;
    }
  }
  return false;
}

const validationMessages: Record<DependencyValidationReason, string> = {
  missing_source: 'Source issue is required.',
  missing_target: 'Target issue is required.',
  self: 'Cannot create a dependency on the same issue.',
  duplicate: 'This dependency already exists.',
  cycle: 'Adding this dependency would create a cycle.',
};

export function validateDependencyAddWithReason(
  items: BeadItemData[],
  sourceId: string | undefined,
  targetId: string | undefined
): DependencyValidationResult {
  if (!sourceId) {
    return { ok: false, reason: 'missing_source' };
  }

  if (!targetId) {
    return { ok: false, reason: 'missing_target' };
  }

  if (sourceId === targetId) {
    return { ok: false, reason: 'self' };
  }

  if (hasDependency(items, sourceId, targetId)) {
    return { ok: false, reason: 'duplicate' };
  }

  if (hasDependencyPath(items, targetId, sourceId)) {
    return { ok: false, reason: 'cycle' };
  }

  return { ok: true };
}

/**
 * Validate whether a dependency can be added from sourceId -> targetId.
 * Returns an error message string if invalid, otherwise undefined.
 */
export function validateDependencyAdd(items: BeadItemData[], sourceId: string, targetId: string): string | undefined {
  const result = validateDependencyAddWithReason(items, sourceId, targetId);
  if (result.ok) {
    return undefined;
  }

  return result.reason ? validationMessages[result.reason] : 'Cannot add this dependency.';
}
