/**
 * Activity Feed Data Layer
 * 
 * Provides interfaces and data fetching for events from the beads SQLite database.
 * Supports event normalization, enrichment with issue titles, relative timestamps,
 * and pagination for large event histories.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseUtcDate } from './utils/format';

const execFileAsync = promisify(execFile);
const DEFAULT_QUERY_TIMEOUT_MS = 5000;

export class ActivityFeedUnavailable extends Error {
  constructor(message: string, public readonly code: 'NO_DB' | 'NO_SQLITE' | 'REMOTE' | 'NO_ACCESS') {
    super(message);
    this.name = 'ActivityFeedUnavailable';
  }
}

/**
 * Raw event data as stored in the SQLite events table
 */
export interface RawEventData {
  id: number;
  issue_id: string;
  event_type: string;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

/**
 * Enriched event data with resolved issue information
 */
export interface EventData {
  id: number;
  issueId: string;
  issueTitle?: string;
  worktreeId?: string;
  eventType: EventType;
  actor: string;
  oldValue: ParsedEventValue | null;
  newValue: ParsedEventValue | null;
  comment: string | null;
  createdAt: Date;
  /** Human-readable description of the event */
  description: string;
  /** Icon name for the event type (codicon) */
  iconName: string;
  /** Color for the event type */
  colorClass: string;
}

/**
 * Known event types from the beads database
 */
export type EventType = 
  | 'created'
  | 'closed'
  | 'reopened'
  | 'status_changed'
  | 'dependency_added'
  | 'dependency_removed'
  | 'title_changed'
  | 'description_changed'
  | 'priority_changed'
  | 'label_added'
  | 'label_removed'
  | 'assigned'
  | 'unassigned'
  | 'commented'
  | 'unknown';

/**
 * Parsed event value (could be JSON object or string)
 */
export interface ParsedEventValue {
  raw: string | null;
  status?: string;
  title?: string;
  priority?: number;
  description?: string;
  [key: string]: unknown;
}

/**
 * Options for fetching events
 */
export interface FetchEventsOptions {
  /** Maximum number of events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by event types */
  eventTypes?: EventType[];
  /** Filter by issue ID */
  issueId?: string;
  /** Filter by actor */
  actor?: string;
  /** Filter events after this date */
  afterDate?: Date;
  /** Filter events before this date */
  beforeDate?: Date;
}

/**
 * Result of fetching events with pagination info
 */
export interface FetchEventsResult {
  events: EventData[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Issue info map for enrichment
 */
export interface IssueInfo {
  id: string;
  title: string;
  status?: string;
}

/**
 * Normalize raw event type string to known EventType
 */
export function normalizeEventType(rawType: string): EventType {
  const typeMap: Record<string, EventType> = {
    'created': 'created',
    'closed': 'closed',
    'reopened': 'reopened',
    'status_changed': 'status_changed',
    'dependency_added': 'dependency_added',
    'dependency_removed': 'dependency_removed',
    'title_changed': 'title_changed',
    'description_changed': 'description_changed',
    'priority_changed': 'priority_changed',
    'label_added': 'label_added',
    'label_removed': 'label_removed',
    'assigned': 'assigned',
    'unassigned': 'unassigned',
    'commented': 'commented',
  };
  return typeMap[rawType] || 'unknown';
}

/**
 * Parse an event value (could be JSON or plain string)
 */
export function parseEventValue(value: string | null): ParsedEventValue | null {
  if (value === null || value === '') {
    return null;
  }
  
  try {
    const parsed = JSON.parse(value);
    return { raw: value, ...parsed };
  } catch {
    return { raw: value };
  }
}

/**
 * Get icon name for event type (VS Code codicons)
 */
export function getEventIcon(eventType: EventType): string {
  const iconMap: Record<EventType, string> = {
    'created': 'sparkle',
    'closed': 'check',
    'reopened': 'history',
    'status_changed': 'sync',
    'dependency_added': 'git-merge',
    'dependency_removed': 'git-compare',
    'title_changed': 'edit',
    'description_changed': 'note',
    'priority_changed': 'flame',
    'label_added': 'tag',
    'label_removed': 'close',
    'assigned': 'person-add',
    'unassigned': 'person',
    'commented': 'comment',
    'unknown': 'question',
  };
  return iconMap[eventType] || 'question';
}

/**
 * Get color class for event type
 */
export function getEventColor(eventType: EventType): string {
  const colorMap: Record<EventType, string> = {
    'created': 'event-created',        // Gold
    'closed': 'event-success',          // Green
    'reopened': 'event-warning',        // Yellow
    'status_changed': 'event-info',     // Blue
    'dependency_added': 'event-purple', // Purple
    'dependency_removed': 'event-purple',
    'title_changed': 'event-info',
    'description_changed': 'event-info',
    'priority_changed': 'event-warning',
    'label_added': 'event-info',
    'label_removed': 'event-info',
    'assigned': 'event-info',
    'unassigned': 'event-info',
    'commented': 'event-info',
    'unknown': 'event-default',
  };
  return colorMap[eventType] || 'event-default';
}

/**
 * Generate a human-readable description for an event
 */
export function generateEventDescription(
  event: Omit<EventData, 'description' | 'iconName' | 'colorClass'>,
  issueTitle?: string
): string {
  const issueRef = `#${event.issueId}`;
  const titlePart = issueTitle ? `: ${truncateString(issueTitle, 40)}` : '';
  
  switch (event.eventType) {
    case 'created':
      return `Issue ${issueRef} created${titlePart}`;
      
    case 'closed': {
      const reason = event.newValue?.raw || '';
      return `Closed ${issueRef}${reason ? ` - ${reason}` : ''}${titlePart}`;
    }
      
    case 'reopened':
      return `Reopened ${issueRef}${titlePart}`;
      
    case 'status_changed': {
      const oldStatus = event.oldValue?.status || 'unknown';
      const newStatus = event.newValue?.status || 'unknown';
      return `Status: ${formatStatus(oldStatus)} → ${formatStatus(newStatus)} on ${issueRef}`;
    }
      
    case 'dependency_added': {
      const comment = event.comment || '';
      if (comment.includes('blocks')) {
        return comment;
      } else if (comment.includes('parent-child')) {
        return comment.replace('parent-child', '→ child of');
      }
      return `Dependency added on ${issueRef}${comment ? `: ${comment}` : ''}`;
    }
      
    case 'dependency_removed': {
      const comment = event.comment || '';
      return `Dependency removed on ${issueRef}${comment ? `: ${comment}` : ''}`;
    }
      
    case 'title_changed': {
      const newTitle = event.newValue?.title || event.newValue?.raw || '';
      return `Title changed on ${issueRef}: ${truncateString(newTitle, 50)}`;
    }
      
    case 'description_changed':
      return `Description updated on ${issueRef}${titlePart}`;
      
    case 'priority_changed': {
      const oldPriority = event.oldValue?.priority;
      const newPriority = event.newValue?.priority;
      return `Priority: P${oldPriority || '?'} → P${newPriority || '?'} on ${issueRef}`;
    }
      
    case 'label_added': {
      const label = event.newValue?.raw || 'label';
      return `Label added: ${label} on ${issueRef}`;
    }
      
    case 'label_removed': {
      const label = event.oldValue?.raw || 'label';
      return `Label removed: ${label} from ${issueRef}`;
    }
      
    case 'assigned': {
      const assignee = event.newValue?.raw || 'someone';
      return `Assigned ${assignee} to ${issueRef}`;
    }
      
    case 'unassigned': {
      const assignee = event.oldValue?.raw || 'someone';
      return `Unassigned ${assignee} from ${issueRef}`;
    }
      
    case 'commented':
      return `Comment added on ${issueRef}${titlePart}`;
      
    default:
      return `Event on ${issueRef}: ${event.eventType}`;
  }
}

/**
 * Format status string for display
 */
export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 1) + '…';
}

/**
 * Format relative time for display
 * More detailed version optimized for activity feed
 */
export function formatRelativeTimeDetailed(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 30) {
    return 'just now';
  } else if (diffSecs < 60) {
    return `${diffSecs} seconds ago`;
  } else if (diffMins === 1) {
    return '1 minute ago';
  } else if (diffMins < 60) {
    return `${diffMins} minutes ago`;
  } else if (diffHours === 1) {
    return '1 hour ago';
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    // Check if it was actually yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `yesterday at ${formatTime(date)}`;
    }
    return '1 day ago';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // Show full date for older events
    return formatDateTime(date);
  }
}

/**
 * Format time as HH:MM AM/PM
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date and time
 */
export function formatDateTime(date: Date): string {
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();
  
  if (isThisYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }) + ' at ' + formatTime(date);
  }
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Get time group label for grouping events (Today, Yesterday, This Week, etc.)
 */
export function getTimeGroup(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    return 'Older';
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (eventDay >= today) {
    return 'Today';
  } else if (eventDay >= yesterday) {
    return 'Yesterday';
  } else if (eventDay >= thisWeekStart) {
    return 'This Week';
  } else if (eventDay >= lastWeekStart) {
    return 'Last Week';
  } else if (eventDay >= thisMonthStart) {
    return 'This Month';
  } else {
    return 'Older';
  }
}

/**
 * Normalize a raw event into enriched EventData
 */
export function normalizeEvent(
  raw: RawEventData,
  issueInfoMap?: Map<string, IssueInfo>
): EventData {
  const eventType = normalizeEventType(raw.event_type);
  const oldValue = parseEventValue(raw.old_value);
  const newValue = parseEventValue(raw.new_value);
  const createdAt = parseUtcDate(raw.created_at);
  const issueInfo = issueInfoMap?.get(raw.issue_id);
  
  const baseEvent: Omit<EventData, 'description' | 'iconName' | 'colorClass'> = {
    id: raw.id,
    issueId: raw.issue_id,
    eventType,
    actor: raw.actor,
    oldValue,
    newValue,
    comment: raw.comment,
    createdAt,
  };
  if (issueInfo?.title) {
    baseEvent.issueTitle = issueInfo.title;
  }
  
  return {
    ...baseEvent,
    description: generateEventDescription(baseEvent, issueInfo?.title),
    iconName: getEventIcon(eventType),
    colorClass: getEventColor(eventType),
  };
}

/**
 * Fetch events from the SQLite database using sqlite3 command
 */
export async function fetchEvents(
  projectRoot: string,
  options: FetchEventsOptions = {},
  env: { timeoutMs?: number } = {}
): Promise<FetchEventsResult> {
  const {
    limit = 50,
    offset = 0,
    eventTypes,
    issueId,
    actor,
    afterDate,
    beforeDate,
  } = options;

  const dbPath = path.join(projectRoot, '.beads', 'beads.db');
  const timeoutMs = env.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

  if (!fs.existsSync(dbPath)) {
    throw new ActivityFeedUnavailable('Activity feed database not found', 'NO_DB');
  }
  
  // Build WHERE clauses
  const whereClauses: string[] = [];
  
  if (issueId) {
    whereClauses.push(`issue_id = '${escapeSql(issueId)}'`);
  }
  
  if (actor) {
    whereClauses.push(`actor = '${escapeSql(actor)}'`);
  }
  
  if (eventTypes && eventTypes.length > 0) {
    const typeList = eventTypes.map(t => `'${escapeSql(t)}'`).join(', ');
    whereClauses.push(`event_type IN (${typeList})`);
  }
  
  if (afterDate) {
    whereClauses.push(`created_at >= '${afterDate.toISOString()}'`);
  }
  
  if (beforeDate) {
    whereClauses.push(`created_at <= '${beforeDate.toISOString()}'`);
  }
  
  const whereClause = whereClauses.length > 0 
    ? `WHERE ${whereClauses.join(' AND ')}` 
    : '';
  
  // Query for events
  const eventsQuery = `
    SELECT id, issue_id, event_type, actor, old_value, new_value, comment, created_at
    FROM events
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  // Query for total count
  const countQuery = `
    SELECT COUNT(*) as count
    FROM events
    ${whereClause}
  `;
  
  try {
    // Ensure sqlite3 is available early
    await execFileAsync('sqlite3', ['-version'], { timeout: timeoutMs });

    // Execute events query
    const { stdout: eventsOutput } = await execFileAsync('sqlite3', [
      '-json',
      dbPath,
      eventsQuery
    ], { timeout: timeoutMs });
    
    // Execute count query
    const { stdout: countOutput } = await execFileAsync('sqlite3', [
      '-json',
      dbPath,
      countQuery
    ], { timeout: timeoutMs });
    
    const rawEvents: RawEventData[] = eventsOutput.trim() ? JSON.parse(eventsOutput) : [];
    const countResult = countOutput.trim() ? JSON.parse(countOutput) : [{ count: 0 }];
    const totalCount = countResult[0]?.count || 0;
    
    // Fetch issue info for enrichment
    const issueIds = [...new Set(rawEvents.map(e => e.issue_id))];
    const issueInfoMap = await fetchIssueInfo(projectRoot, issueIds);
    
    // Normalize events
    const events = rawEvents.map(raw => normalizeEvent(raw, issueInfoMap));
    
    return {
      events,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    const err: any = error;
    if (err?.code === 'ENOENT') {
      throw new ActivityFeedUnavailable('sqlite3 binary not found', 'NO_SQLITE');
    }
    if (err?.code === 'EACCES') {
      throw new ActivityFeedUnavailable('Activity feed database is not readable (permissions)', 'NO_ACCESS');
    }
    const stderr = String(err?.stderr ?? err?.message ?? '');
    if (/unable to open database file/i.test(stderr) || /no such file or directory/i.test(stderr)) {
      throw new ActivityFeedUnavailable('Activity feed database not found', 'NO_DB');
    }
    throw error;
  }
}

/**
 * Fetch issue info for a list of issue IDs
 */
async function fetchIssueInfo(
  projectRoot: string,
  issueIds: string[]
): Promise<Map<string, IssueInfo>> {
  if (issueIds.length === 0) {
    return new Map();
  }
  
  const dbPath = path.join(projectRoot, '.beads', 'beads.db');
  const idList = issueIds.map(id => `'${escapeSql(id)}'`).join(', ');
  
  const query = `
    SELECT id, title, status
    FROM issues
    WHERE id IN (${idList})
  `;
  
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, query], { timeout: DEFAULT_QUERY_TIMEOUT_MS });
    const issues: Array<{ id: string; title: string; status: string }> = 
      stdout.trim() ? JSON.parse(stdout) : [];
    
    const map = new Map<string, IssueInfo>();
    for (const issue of issues) {
      map.set(issue.id, {
        id: issue.id,
        title: issue.title,
        status: issue.status,
      });
    }
    return map;
  } catch (error) {
    console.error('Failed to fetch issue info:', error);
    return new Map();
  }
}

/**
 * Group events by time period
 */
export function groupEventsByTime(events: EventData[]): Map<string, EventData[]> {
  const groups = new Map<string, EventData[]>();
  
  for (const event of events) {
    const group = getTimeGroup(event.createdAt);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(event);
  }
  
  return groups;
}

/**
 * Escape SQL string to prevent injection
 */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}
