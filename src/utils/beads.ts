import { BeadItemData, pickAssignee } from '@beads/core';
import { BeadViewModel } from '../views/issues/types';

export {
  BeadItemData,
  extractBeads,
  normalizeBead,
  pickAssignee,
  pickFirstKey,
  pickTags,
  pickValue,
  stripBeadIdPrefix,
} from '@beads/core';

export function toViewModel(item: BeadItemData): BeadViewModel {
  const raw = item.raw as any;
  const assignee = pickAssignee(item);
  
  return {
    id: item.id,
    title: item.title,
    description: raw?.description,
    status: item.status || 'open',
    priority: typeof raw?.priority === 'number' ? raw.priority : 2,
    assignee: assignee ? {
      name: assignee,
      color: 'var(--vscode-charts-blue)', // Placeholder, ideally derived from name
      initials: assignee.slice(0, 2).toUpperCase()
    } : undefined,
    labels: Array.isArray(raw?.labels) ? raw.labels : [],
    updatedAt: item.updatedAt || new Date().toISOString(),
    isStale: false, // TODO: Pass in stale threshold logic
    worktree: raw?.worktree,
    epicId: item.parentId,
    icon: {
      id: getIconForType(item.issueType),
      color: getColorForType(item.issueType)
    }
  };
}

function getIconForType(type?: string): string {
  switch (type) {
    case 'epic': return 'milestone';
    case 'bug': return 'bug';
    case 'feature': return 'sparkle';
    case 'task': return 'check';
    case 'chore': return 'tools';
    default: return 'circle-outline';
  }
}

function getColorForType(type?: string): string | undefined {
  switch (type) {
    case 'epic': return 'var(--vscode-charts-purple)';
    case 'bug': return 'var(--vscode-charts-red)';
    case 'feature': return 'var(--vscode-charts-green)';
    case 'task': return 'var(--vscode-charts-blue)';
    case 'chore': return 'var(--vscode-charts-yellow)';
    default: return undefined;
  }
}

export function deriveAssigneeName(bead: BeadItemData, fallback: string): string {
  const typed = (bead as any).assignee;
  if (typeof typed === 'string' && typed.trim().length > 0) {
    return typed.trim();
  }

  const raw = bead.raw as any;
  const candidates = [
    raw?.assignee,
    raw?.assignee_name,
    raw?.assigneeName,
    raw?.assigned_to,
    raw?.owner,
    raw?.user,
    raw?.author
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object' && typeof candidate.name === 'string' && candidate.name.trim().length > 0) {
      return candidate.name.trim();
    }
  }

  return fallback;
}
