export const ALLOWED_STATUSES = ['open', 'in_progress', 'blocked', 'closed'] as const;
export type BeadsStatus = typeof ALLOWED_STATUSES[number];

export function normalizeStatus(value: string | undefined | null): BeadsStatus | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return (ALLOWED_STATUSES as readonly string[]).find((s) => s === normalized) as BeadsStatus | undefined;
}

export function canTransition(currentStatus: string | undefined, targetStatus: string): boolean {
  const target = normalizeStatus(targetStatus);
  if (!target) {
    return false;
  }

  const current = normalizeStatus(currentStatus);
  if (!current) {
    return true;
  }

  return current !== target;
}

export function formatStatusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return status;
  }
  return normalized.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
