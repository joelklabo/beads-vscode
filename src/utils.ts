import * as path from 'path';

export interface BeadItemData {
  id: string;
  title: string;
  description?: string;
  filePath?: string;
  status?: string;
  tags?: string[];
  updatedAt?: string;
  externalReferenceId?: string;
  externalReferenceDescription?: string;
  raw?: unknown;
  idKey?: string;
  externalReferenceKey?: string;
  blockingDepsCount?: number;
}

export function pickValue(entry: any, keys: string[], fallback?: string): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
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
      const value = entry[key];
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

  const candidate = entry.labels ?? entry.tags ?? entry.tag_list;
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

export function normalizeBead(entry: any, index = 0): BeadItemData {
  const { value: id, key: idKey } = pickFirstKey(entry, ['id', 'uuid', 'beadId']);
  const title = pickValue(entry, ['title', 'name'], id ?? `bead-${index}`) ?? `bead-${index}`;
  const description = pickValue(entry, ['description', 'desc', 'body']);
  const filePath = pickValue(entry, ['file', 'path', 'filename']);
  const status = pickValue(entry, ['status', 'state']);
  const tags = pickTags(entry);
  const updatedAt = pickValue(entry, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']);
  const { value: externalReferenceRaw, key: externalReferenceKey } = pickFirstKey(entry, [
    'external_reference_id',
    'externalReferenceId',
    'external_ref',
    'external_reference',
    'externalRefId',
  ]);

  // Parse external_ref format: "ID:description"
  let externalReferenceId: string | undefined;
  let externalReferenceDescription: string | undefined;
  if (externalReferenceRaw) {
    const parts = externalReferenceRaw.split(':', 2);
    externalReferenceId = parts[0];
    externalReferenceDescription = parts.length > 1 ? parts[1] : undefined;
  }

  // Count blocking dependencies (those not closed)
  let blockingDepsCount = 0;
  const dependencies = entry?.dependencies || [];
  for (const dep of dependencies) {
    const depType = dep.dep_type || dep.type || 'related';
    if (depType === 'blocks') {
      // We'll count it - the actual status check happens in extension.ts with all items
      blockingDepsCount++;
    }
  }

  return {
    id: id ?? `bead-${index}`,
    idKey,
    title,
    description,
    filePath,
    status,
    tags,
    updatedAt,
    externalReferenceId,
    externalReferenceDescription,
    externalReferenceKey,
    raw: entry,
    blockingDepsCount,
  };
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

    const project = record.project;
    if (project && typeof project === 'object') {
      const projectBeads = (project as Record<string, unknown>).beads;
      if (Array.isArray(projectBeads)) {
        return projectBeads as any[];
      }
    }
  }

  return undefined;
}

export function resolveDataFilePath(dataFile: string, projectRoot: string | undefined): string | undefined {
  if (!dataFile || dataFile.trim().length === 0) {
    return undefined;
  }

  if (path.isAbsolute(dataFile)) {
    return dataFile;
  }

  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, dataFile);
}

export function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m] || m;
  });
}

export function linkifyText(text: string): string {
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  return escaped.replace(urlRegex, '<a href="$1" class="external-link" target="_blank">$1</a>');
}

export function createTooltip(bead: BeadItemData): string {
  const parts: string[] = [bead.title];
  if (bead.status) {
    parts.push(`Status: ${bead.status}`);
  }
  if (bead.filePath) {
    parts.push(`File: ${bead.filePath}`);
  }
  if (bead.tags && bead.tags.length > 0) {
    parts.push(`Tags: ${bead.tags.join(', ')}`);
  }
  if (bead.externalReferenceId) {
    const displayText = bead.externalReferenceDescription || bead.externalReferenceId;
    parts.push(`External Ref: ${displayText} (${bead.externalReferenceId})`);
  }
  return parts.join('\n');
}

export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) {
    return '';
  }
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  } else {
    return `${diffMonths}mo ago`;
  }
}
