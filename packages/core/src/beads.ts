export interface BeadItemData {
  id: string;
  title: string;
  description?: string;
  filePath?: string;
  status?: string;
  tags?: string[];
  assignee?: string;
  updatedAt?: string;
  externalReferenceId?: string;
  externalReferenceDescription?: string;
  raw?: unknown;
  idKey?: string;
  externalReferenceKey?: string;
  blockingDepsCount?: number;
  /** Timestamp when the task entered in_progress status (for stale detection) */
  inProgressSince?: string;
  /** Issue type (epic, task, bug, feature, chore, spike) */
  issueType?: string;
  /** Parent issue ID for parent-child relationships (used for epic grouping) */
  parentId?: string;
  /** Number of child issues (for epics) */
  childCount?: number;
}

export function pickValue(entry: any, keys: string[], fallback?: string): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (key in entry) {
      const value = (entry as any)[key];
      if (value === undefined || value === null) {
        continue;
      }
      return String(value);
    }
  }

  return fallback;
}

export function pickFirstKey(entry: any, keys: string[]): { value?: string; key?: string } {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  for (const key of keys) {
    if (key in entry) {
      const value = (entry as any)[key];
      if (value === undefined || value === null) {
        continue;
      }
      return { value: String(value), key };
    }
  }

  return {};
}

export function pickTags(entry: any): string[] | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidate = (entry as any).labels ?? (entry as any).tags ?? (entry as any).tag_list;
  if (!candidate) {
    return undefined;
  }

  if (Array.isArray(candidate)) {
    return candidate.map((tag) => String(tag));
  }

  if (typeof candidate === 'string') {
    return candidate
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  }

  return undefined;
}

export function pickAssignee(entry: any): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidateKeys = ['assignee', 'assignee_name', 'assigneeName', 'assigned_to', 'owner', 'user', 'author'];

  for (const key of candidateKeys) {
    const value = (entry as any)[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      const name = (value as any).name;
      if (typeof name === 'string' && name.trim().length > 0) {
        return name.trim();
      }
    }
  }

  return undefined;
}

export function normalizeBead(entry: any, index = 0): BeadItemData {
  const { value: id, key: idKey } = pickFirstKey(entry, ['id', 'uuid', 'beadId']);
  const title = pickValue(entry, ['title', 'name'], id ?? `bead-${index}`) ?? `bead-${index}`;
  const description = pickValue(entry, ['description', 'desc', 'body']);
  const filePath = pickValue(entry, ['file', 'path', 'filename']);
  const status = pickValue(entry, ['status', 'state']);
  const tags = pickTags(entry);
  const assignee = pickAssignee(entry);
  const updatedAt = pickValue(entry, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']);
  const issueType = pickValue(entry, ['issue_type', 'issueType', 'type']);
  const { value: externalReferenceRaw, key: externalReferenceKey } = pickFirstKey(entry, [
    'external_reference_id',
    'externalReferenceId',
    'external_ref',
    'external_reference',
    'externalRefId'
  ]);

  let externalReferenceId: string | undefined;
  let externalReferenceDescription: string | undefined;
  if (externalReferenceRaw) {
    const parts = externalReferenceRaw.split(':', 2);
    externalReferenceId = parts[0];
    externalReferenceDescription = parts.length > 1 ? parts[1] : undefined;
  }

  let blockingDepsCount = 0;
  let parentId: string | undefined;
  const dependencies = (entry as any)?.dependencies || [];
  for (const dep of dependencies) {
    const depType = dep.dep_type || dep.type || 'related';
    if (depType === 'blocks') {
      blockingDepsCount++;
    } else if (depType === 'parent-child') {
      parentId = dep.depends_on_id;
    }
  }

  const inProgressSince = status === 'in_progress' ? updatedAt : undefined;

  const bead: BeadItemData = {
    id: id ?? `bead-${index}`,
    title,
    raw: entry,
    blockingDepsCount,
  };
  if (idKey) bead.idKey = idKey;
  if (description !== undefined) bead.description = description;
  if (filePath !== undefined) bead.filePath = filePath;
  if (status !== undefined) bead.status = status;
  if (tags !== undefined) bead.tags = tags;
  if (assignee !== undefined) bead.assignee = assignee;
  if (updatedAt !== undefined) bead.updatedAt = updatedAt;
  if (externalReferenceId !== undefined) bead.externalReferenceId = externalReferenceId;
  if (externalReferenceDescription !== undefined) bead.externalReferenceDescription = externalReferenceDescription;
  if (externalReferenceKey !== undefined) bead.externalReferenceKey = externalReferenceKey;
  if (inProgressSince !== undefined) bead.inProgressSince = inProgressSince;
  if (issueType !== undefined) bead.issueType = issueType;
  if (parentId !== undefined) bead.parentId = parentId;

  return bead;
}

export function extractBeads(root: unknown): any[] | undefined {
  if (Array.isArray(root)) {
    return root;
  }

  if (root && typeof root === 'object') {
    const record = root as Record<string, unknown>;
    if (Array.isArray(record.beads)) {
      return record.beads as any[];
    }

    const project = (record as any).project;
    if (project && typeof project === 'object') {
      const projectBeads = (project as Record<string, unknown>).beads;
      if (Array.isArray(projectBeads)) {
        return projectBeads as any[];
      }
    }
  }

  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove redundant bead ID prefixes from titles (e.g., "ABC-1 Title" → "Title").
 */
export function stripBeadIdPrefix(title: string, id: string): string {
  const normalizedTitle = title?.trim?.() ?? '';
  if (!normalizedTitle) {
    return normalizedTitle;
  }

  const escapedId = escapeRegex(id);
  const patterns = [
    new RegExp(`^\\[?${escapedId}\\]?[\\s:\\-–—]+`, 'i'),
    new RegExp(`^${escapedId}$`, 'i')
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalizedTitle)) {
      const cleaned = normalizedTitle.replace(pattern, '').trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }

  return normalizedTitle;
}
