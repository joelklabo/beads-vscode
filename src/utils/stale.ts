import { BeadItemData } from './beads';

export const DEFAULT_STALE_THRESHOLD_HOURS = 24;

export function isStale(bead: BeadItemData, thresholdHours: number = DEFAULT_STALE_THRESHOLD_HOURS): boolean {
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return false;
  }

  const inProgressDate = new Date(bead.inProgressSince);
  const diffHours = (Date.now() - inProgressDate.getTime()) / (1000 * 60 * 60);
  return diffHours >= thresholdHours;
}

export function getStaleInfo(bead: BeadItemData): { hoursInProgress: number; formattedTime: string } | undefined {
  if (bead.status !== 'in_progress' || !bead.inProgressSince) {
    return undefined;
  }

  const inProgressDate = new Date(bead.inProgressSince);
  const diffMs = Date.now() - inProgressDate.getTime();
  const hoursInProgress = diffMs / (1000 * 60 * 60);

  const days = Math.floor(hoursInProgress / 24);
  const hours = Math.floor(hoursInProgress % 24);

  let formattedTime: string;
  if (days > 0) {
    formattedTime = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    formattedTime = `${hours}h`;
  } else {
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    formattedTime = `${minutes}m`;
  }

  return { hoursInProgress, formattedTime };
}
