import * as assert from 'assert';
import {
  normalizeEventType,
  parseEventValue,
  getEventIcon,
  getEventColor,
  generateEventDescription,
  formatStatus,
  truncateString,
  formatRelativeTimeDetailed,
  formatTime,
  formatDateTime,
  getTimeGroup,
  normalizeEvent,
  groupEventsByTime,
  EventType,
  EventData,
  RawEventData,
} from '../../activityFeed';

describe('Activity Feed Functions', () => {

  describe('normalizeEventType', () => {
    it('should return known event types', () => {
      assert.strictEqual(normalizeEventType('created'), 'created');
      assert.strictEqual(normalizeEventType('closed'), 'closed');
      assert.strictEqual(normalizeEventType('status_changed'), 'status_changed');
      assert.strictEqual(normalizeEventType('dependency_added'), 'dependency_added');
    });

    it('should return "unknown" for unrecognized types', () => {
      assert.strictEqual(normalizeEventType('random_event'), 'unknown');
      assert.strictEqual(normalizeEventType(''), 'unknown');
    });
  });

  describe('parseEventValue', () => {
    it('should return null for null input', () => {
      assert.strictEqual(parseEventValue(null), null);
    });

    it('should return null for empty string', () => {
      assert.strictEqual(parseEventValue(''), null);
    });

    it('should parse JSON objects', () => {
      const value = '{"status":"in_progress","title":"Test"}';
      const result = parseEventValue(value);
      assert.strictEqual(result?.status, 'in_progress');
      assert.strictEqual(result?.title, 'Test');
      assert.strictEqual(result?.raw, value);
    });

    it('should return raw value for non-JSON strings', () => {
      const value = 'plain text';
      const result = parseEventValue(value);
      assert.strictEqual(result?.raw, 'plain text');
    });
  });

  describe('getEventIcon', () => {
    it('should return correct icons for known types', () => {
      assert.strictEqual(getEventIcon('created'), 'sparkle');
      assert.strictEqual(getEventIcon('closed'), 'check');
      assert.strictEqual(getEventIcon('status_changed'), 'sync');
      assert.strictEqual(getEventIcon('dependency_added'), 'git-merge');
    });

    it('should return question for unknown types', () => {
      assert.strictEqual(getEventIcon('unknown'), 'question');
    });
  });

  describe('getEventColor', () => {
    it('should return correct colors for known types', () => {
      assert.strictEqual(getEventColor('created'), 'event-created');
      assert.strictEqual(getEventColor('closed'), 'event-success');
      assert.strictEqual(getEventColor('status_changed'), 'event-info');
      assert.strictEqual(getEventColor('dependency_added'), 'event-purple');
    });

    it('should return default for unknown types', () => {
      assert.strictEqual(getEventColor('unknown'), 'event-default');
    });
  });

  describe('formatStatus', () => {
    it('should format single word status', () => {
      assert.strictEqual(formatStatus('open'), 'Open');
      assert.strictEqual(formatStatus('closed'), 'Closed');
    });

    it('should format underscore-separated status', () => {
      assert.strictEqual(formatStatus('in_progress'), 'In Progress');
    });
  });

  describe('truncateString', () => {
    it('should not truncate short strings', () => {
      assert.strictEqual(truncateString('short', 10), 'short');
    });

    it('should truncate long strings with ellipsis', () => {
      assert.strictEqual(truncateString('this is a very long string', 10), 'this is a…');
    });

    it('should handle exact length', () => {
      assert.strictEqual(truncateString('exact', 5), 'exact');
    });
  });

  describe('generateEventDescription', () => {
    it('should generate description for created event', () => {
      const event = {
        id: 1,
        issueId: 'bd-123',
        eventType: 'created' as EventType,
        actor: 'user',
        oldValue: null,
        newValue: null,
        comment: null,
        createdAt: new Date(),
      };
      const result = generateEventDescription(event, 'Fix login bug');
      assert.strictEqual(result, 'Issue #bd-123 created: Fix login bug');
    });

    it('should generate description for status change', () => {
      const event = {
        id: 1,
        issueId: 'bd-123',
        eventType: 'status_changed' as EventType,
        actor: 'user',
        oldValue: { raw: '{}', status: 'open' },
        newValue: { raw: '{}', status: 'in_progress' },
        comment: null,
        createdAt: new Date(),
      };
      const result = generateEventDescription(event);
      assert.strictEqual(result, 'Status: Open → In Progress on #bd-123');
    });

    it('should generate description for closed event', () => {
      const event = {
        id: 1,
        issueId: 'bd-123',
        eventType: 'closed' as EventType,
        actor: 'user',
        oldValue: null,
        newValue: { raw: 'completed' },
        comment: null,
        createdAt: new Date(),
      };
      const result = generateEventDescription(event, 'Fix login bug');
      assert.strictEqual(result, 'Closed #bd-123 - completed: Fix login bug');
    });

    it('should generate description for dependency added', () => {
      const event = {
        id: 1,
        issueId: 'bd-123',
        eventType: 'dependency_added' as EventType,
        actor: 'daemon',
        oldValue: null,
        newValue: null,
        comment: 'Added dependency: bd-123 blocks bd-456',
        createdAt: new Date(),
      };
      const result = generateEventDescription(event);
      assert.strictEqual(result, 'Added dependency: bd-123 blocks bd-456');
    });
  });

  describe('formatRelativeTimeDetailed', () => {
    it('should return "just now" for very recent times', () => {
      const now = new Date();
      const result = formatRelativeTimeDetailed(now);
      assert.strictEqual(result, 'just now');
    });

    it('should return seconds ago', () => {
      const date = new Date(Date.now() - 45 * 1000); // 45 seconds ago
      const result = formatRelativeTimeDetailed(date);
      assert.strictEqual(result, '45 seconds ago');
    });

    it('should return "1 minute ago"', () => {
      const date = new Date(Date.now() - 90 * 1000); // 90 seconds ago
      const result = formatRelativeTimeDetailed(date);
      assert.strictEqual(result, '1 minute ago');
    });

    it('should return plural minutes', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const result = formatRelativeTimeDetailed(date);
      assert.strictEqual(result, '5 minutes ago');
    });

    it('should return "1 hour ago"', () => {
      const date = new Date(Date.now() - 90 * 60 * 1000); // 90 minutes ago
      const result = formatRelativeTimeDetailed(date);
      assert.strictEqual(result, '1 hour ago');
    });

    it('should return plural hours', () => {
      const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
      const result = formatRelativeTimeDetailed(date);
      assert.strictEqual(result, '5 hours ago');
    });
  });

  describe('getTimeGroup', () => {
    it('should return "Today" for today', () => {
      const now = new Date();
      assert.strictEqual(getTimeGroup(now), 'Today');
    });

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      assert.strictEqual(getTimeGroup(yesterday), 'Yesterday');
    });

    it('should return "Older" for old dates', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 2);
      assert.strictEqual(getTimeGroup(oldDate), 'Older');
    });
  });

  describe('normalizeEvent', () => {
    it('should normalize a raw event', () => {
      const raw: RawEventData = {
        id: 1,
        issue_id: 'bd-123',
        event_type: 'created',
        actor: 'user',
        old_value: null,
        new_value: null,
        comment: null,
        created_at: '2025-12-03T10:00:00Z',
      };
      
      const issueInfoMap = new Map([
        ['bd-123', { id: 'bd-123', title: 'Test Issue', status: 'open' }]
      ]);
      
      const result = normalizeEvent(raw, issueInfoMap);
      
      assert.strictEqual(result.id, 1);
      assert.strictEqual(result.issueId, 'bd-123');
      assert.strictEqual(result.issueTitle, 'Test Issue');
      assert.strictEqual(result.eventType, 'created');
      assert.strictEqual(result.actor, 'user');
      assert.strictEqual(result.iconName, 'sparkle');
      assert.strictEqual(result.colorClass, 'event-created');
      assert.ok(result.description.includes('#bd-123'));
    });
  });

  describe('groupEventsByTime', () => {
    it('should group events by time period', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const events: EventData[] = [
        {
          id: 1,
          issueId: 'bd-1',
          eventType: 'created',
          actor: 'user',
          oldValue: null,
          newValue: null,
          comment: null,
          createdAt: now,
          description: 'Test 1',
          iconName: 'sparkle',
          colorClass: 'event-created',
        },
        {
          id: 2,
          issueId: 'bd-2',
          eventType: 'closed',
          actor: 'user',
          oldValue: null,
          newValue: null,
          comment: null,
          createdAt: yesterday,
          description: 'Test 2',
          iconName: 'check',
          colorClass: 'event-success',
        },
      ];
      
      const groups = groupEventsByTime(events);
      
      assert.strictEqual(groups.size, 2);
      assert.strictEqual(groups.get('Today')?.length, 1);
      assert.strictEqual(groups.get('Yesterday')?.length, 1);
    });

    it('should handle empty array', () => {
      const groups = groupEventsByTime([]);
      assert.strictEqual(groups.size, 0);
    });
  });

  describe('formatTime', () => {
    it('should format time in 12-hour format', () => {
      const date = new Date('2025-12-03T14:30:00');
      const result = formatTime(date);
      // The exact format depends on locale, but should contain PM
      assert.ok(result.includes('PM') || result.includes('pm') || result.includes('2'));
    });
  });

  describe('formatDateTime', () => {
    it('should format date with time for this year', () => {
      const date = new Date();
      date.setMonth(0); // January
      date.setDate(15);
      date.setHours(14, 30, 0);
      const result = formatDateTime(date);
      // Should contain month and day
      assert.ok(result.includes('Jan') || result.includes('15'));
    });

    it('should include year for previous years', () => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 1);
      const result = formatDateTime(date);
      // Should contain the year
      assert.ok(result.includes(String(date.getFullYear())));
    });
  });
});
