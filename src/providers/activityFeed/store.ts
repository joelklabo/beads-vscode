import {
  EventData,
  EventType,
  fetchEvents,
  FetchEventsOptions,
  groupEventsByTime,
} from '../../activityFeed';

export type TimeRange = 'today' | 'week' | 'month' | 'all';

export interface ActivityStatistics {
  eventsToday: number;
  eventsThisWeek: number;
  mostActiveIssue?: { issueId: string; count: number };
  issuesClosedLastWeek: number;
  velocity: number; // issues closed per day
  currentStreak: number; // days with activity
}

export class ActivityFeedStore {
  private events: EventData[] = [];
  private totalEvents = 0;
  private pageSize = 200;
  private desiredLimit = this.pageSize * 5;
  private currentPage = 0;
  private filterEventTypes: EventType[] | undefined;
  private filterIssueId: string | undefined;
  private filterTimeRange: TimeRange = 'all';
  private refreshInProgress = false;
  private pendingRefresh = false;
  private worktreeId: string | undefined;

  setWorktreeId(id: string | undefined): void {
    this.worktreeId = id;
  }

  getWorktreeId(): string | undefined {
    return this.worktreeId;
  }

  setEventTypeFilter(types: EventType[] | undefined): void {
    this.filterEventTypes = types;
    this.resetPaging();
  }

  setIssueFilter(issueId: string | undefined): void {
    this.filterIssueId = issueId;
    this.resetPaging();
  }

  setTimeRangeFilter(range: TimeRange): void {
    this.filterTimeRange = range;
    this.resetPaging();
  }

  clearFilters(): void {
    this.filterEventTypes = undefined;
    this.filterIssueId = undefined;
    this.filterTimeRange = 'all';
    this.resetPaging();
  }

  private resetPaging(): void {
    this.currentPage = 0;
    this.desiredLimit = this.pageSize * 5;
  }

  async loadMore(projectRoot: string | undefined): Promise<void> {
    if (!projectRoot) {
      return;
    }

    if (this.events.length >= this.totalEvents) {
      return;
    }

    this.desiredLimit = Math.min(this.totalEvents, this.desiredLimit + this.pageSize);
    this.currentPage++;
    await this.refresh(projectRoot);
  }

  async refresh(projectRoot: string | undefined): Promise<void> {
    if (this.refreshInProgress) {
      this.pendingRefresh = true;
      return;
    }

    this.refreshInProgress = true;

    try {
      if (!projectRoot) {
        this.events = [];
        this.totalEvents = 0;
        return;
      }

      const targetLimit = this.totalEvents > 0 ? Math.min(this.totalEvents, this.desiredLimit) : this.desiredLimit;

      const options: FetchEventsOptions = {
        limit: targetLimit,
        offset: 0,
        eventTypes: this.filterEventTypes,
        issueId: this.filterIssueId,
      };

      if (this.filterTimeRange !== 'all') {
        const now = new Date();
        switch (this.filterTimeRange) {
          case 'today':
            options.afterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            options.afterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            options.afterDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        }
      }

      const result = await fetchEvents(projectRoot, options);
      const unique = new Map<number, EventData>();
      result.events.forEach((event) => {
        if (!unique.has(event.id)) {
          unique.set(event.id, { ...event, worktreeId: this.worktreeId });
        }
      });

      this.events = Array.from(unique.values());
      this.totalEvents = result.totalCount;
    } finally {
      this.refreshInProgress = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        await this.refresh(projectRoot);
      }
    }
  }

  getEvents(): EventData[] {
    return this.events;
  }

  getGroupedEvents(): Map<string, EventData[]> {
    return groupEventsByTime(this.events);
  }

  getStatistics(): ActivityStatistics {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const eventsToday = this.events.filter((e) => e.createdAt >= todayStart).length;
    const eventsThisWeek = this.events.filter((e) => e.createdAt >= weekStart).length;

    const issueCounts = new Map<string, number>();
    for (const event of this.events) {
      issueCounts.set(event.issueId, (issueCounts.get(event.issueId) || 0) + 1);
    }

    let mostActiveIssue: { issueId: string; count: number } | undefined;
    let maxCount = 0;
    for (const [issueId, count] of issueCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveIssue = { issueId, count };
      }
    }

    const closedEvents = this.events.filter(
      (e) => e.createdAt >= weekStart && e.eventType === 'closed'
    );
    const issuesClosedLastWeek = new Set(closedEvents.map((e) => e.issueId)).size;

    const velocity = issuesClosedLastWeek / 7;

    let currentStreak = 0;
    const dayMap = new Set<string>();
    for (const event of this.events) {
      const dayKey = event.createdAt.toISOString().split('T')[0];
      dayMap.add(dayKey);
    }

    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dayKey = checkDate.toISOString().split('T')[0];
      if (dayMap.has(dayKey)) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      eventsToday,
      eventsThisWeek,
      mostActiveIssue,
      issuesClosedLastWeek,
      velocity,
      currentStreak,
    };
  }

  getStatsSummary(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const event of this.events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
    }
    return { total: Math.max(this.totalEvents, this.events.length), byType };
  }
}

export default ActivityFeedStore;
