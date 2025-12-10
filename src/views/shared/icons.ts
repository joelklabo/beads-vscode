import { IssueTypeId, PriorityId, StatusId } from './theme';

export const STATUS_ICONS: Record<StatusId, string> = {
  open: 'circle-outline',
  in_progress: 'play',
  blocked: 'stop',
  closed: 'pass',
};

export const PRIORITY_ICONS: Record<PriorityId, string> = {
  0: 'flame',
  1: 'arrow-up',
  2: 'arrow-right',
  3: 'arrow-down',
};

export const ISSUE_TYPE_ICONS: Record<IssueTypeId, string> = {
  epic: 'list-tree',
  feature: 'sparkle',
  bug: 'bug',
  task: 'checklist',
  chore: 'wrench',
  spike: 'telescope',
};

export const DEFAULT_ASSIGNEE_ICON = 'account';
export const TIME_ICON = 'history';

export const codiconClass = (id: string): string => `codicon codicon-${id}`;

export function getStatusIcon(id?: string): string {
  if (id && (STATUS_ICONS as any)[id]) {
    return STATUS_ICONS[id as StatusId];
  }
  return STATUS_ICONS.open;
}

export function getPriorityIcon(id?: number): string {
  if (id !== undefined) {
    const key = Math.max(0, Math.min(3, Math.round(id))) as PriorityId;
    return PRIORITY_ICONS[key];
  }
  return PRIORITY_ICONS[2];
}

export function getIssueTypeIcon(id?: string): string {
  if (id && (ISSUE_TYPE_ICONS as any)[id]) {
    return ISSUE_TYPE_ICONS[id as IssueTypeId];
  }
  return ISSUE_TYPE_ICONS.task;
}
