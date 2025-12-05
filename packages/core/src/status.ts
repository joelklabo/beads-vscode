export const ALLOWED_STATUSES = ['open', 'in_progress', 'blocked', 'closed'] as const;
export type BeadsStatus = (typeof ALLOWED_STATUSES)[number];

const STATUS_PRIORITY: Record<string, number> = {
  open: 0,
  in_progress: 1,
  blocked: 2,
  closed: 3,
};

export function normalizeStatus(value: string | undefined | null): BeadsStatus | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return (ALLOWED_STATUSES as readonly string[]).find((s) => s === normalized) as BeadsStatus | undefined;
}

export function validateStatusChange(currentStatus: string | undefined, targetStatus: string): { allowed: boolean; reason?: string } {
  const target = normalizeStatus(targetStatus);
  if (!target) {
    return { allowed: false, reason: 'invalid target status' };
  }

  const current = normalizeStatus(currentStatus);
  if (current && current === target) {
    return { allowed: false, reason: 'already in target status' };
  }

  return { allowed: true };
}

export function canTransition(currentStatus: string | undefined, targetStatus: string): boolean {
  return validateStatusChange(currentStatus, targetStatus).allowed;
}

export function formatStatusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return status;
  }
  return normalized.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function validateStatusSelection(input: string | undefined): BeadsStatus | undefined {
  return normalizeStatus(input);
}

export function statusPriority(status: string | undefined): number {
  const normalized = normalizeStatus(status);
  return STATUS_PRIORITY[normalized ?? ''] ?? Number.POSITIVE_INFINITY;
}

export function compareStatus(a?: string, b?: string): number {
  return statusPriority(a) - statusPriority(b);
}

export function formatPriorityLabel(priority: number | string | undefined): string {
  if (priority === undefined || priority === null) {
    return '';
  }
  const numeric = typeof priority === 'string' ? Number(priority) : priority;
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return ['', 'P1', 'P2', 'P3', 'P4'][numeric] || '';
}
