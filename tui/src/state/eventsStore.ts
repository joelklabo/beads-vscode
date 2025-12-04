export interface FeedEvent {
  id: string;
  issueId: string;
  description: string;
  actor?: string;
  icon?: string;
  createdAt: string | Date;
  worktreeId?: string;
}

export interface EventFilters {
  worktreeId?: string;
  actor?: string;
  issueId?: string;
  search?: string;
}

export type EventSection = 'Today' | 'Yesterday' | 'This Week' | 'Older';

const toDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

export const relativeLabel = (created: Date, now = new Date()): string => {
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
};

export const bucketFor = (created: Date, now = new Date()): EventSection => {
  const toUtcMidnight = (d: Date): number =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  const createdMidnight = toUtcMidnight(created);
  const nowMidnight = toUtcMidnight(now);

  const diffDays = Math.floor((nowMidnight - createdMidnight) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  return 'Older';
};

export const filterEvents = (events: FeedEvent[], filters: EventFilters = {}): FeedEvent[] => {
  const search = filters.search?.toLowerCase().trim();
  return events.filter((event) => {
    if (filters.worktreeId && event.worktreeId !== filters.worktreeId) return false;
    if (filters.actor && event.actor?.toLowerCase() !== filters.actor.toLowerCase()) return false;
    if (filters.issueId && event.issueId.toLowerCase() !== filters.issueId.toLowerCase()) return false;
    if (search) {
      const haystack = [event.description, event.actor, event.issueId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
};

export const sortByNewest = (events: FeedEvent[]): FeedEvent[] =>
  [...events].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());

export interface SectionedEvents {
  title: EventSection;
  items: (FeedEvent & { createdDate: Date; relative: string })[];
}

export const buildSections = (
  events: FeedEvent[],
  filters: EventFilters = {},
  now = new Date()
): SectionedEvents[] => {
  const filtered = sortByNewest(filterEvents(events, filters));
  const buckets: Record<EventSection, SectionedEvents> = {
    Today: { title: 'Today', items: [] },
    Yesterday: { title: 'Yesterday', items: [] },
    'This Week': { title: 'This Week', items: [] },
    Older: { title: 'Older', items: [] },
  };

  for (const ev of filtered) {
    const createdDate = toDate(ev.createdAt);
    const section = bucketFor(createdDate, now);
    buckets[section].items.push({ ...ev, createdDate, relative: relativeLabel(createdDate, now) });
  }

  return (['Today', 'Yesterday', 'This Week', 'Older'] as EventSection[])
    .map((title) => buckets[title])
    .filter((s) => s.items.length > 0);
};
