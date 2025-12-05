import * as assert from 'assert';
import * as path from 'path';
import {
  BeadItemData,
  extractBeads,
  normalizeBead,
  pickAssignee,
  pickFirstKey,
  pickTags,
  pickValue
} from '../../utils/beads';
import { resolveDataFilePath } from '../../utils/fs';
import { DEFAULT_STALE_THRESHOLD_HOURS, getStaleInfo, isStale } from '../../utils/stale';
import { escapeHtml, formatError, formatRelativeTime, linkifyText } from '../../utils/format';
import { sanitizeInlineText } from '../../utils/sanitize';
import { formatStatusLabel } from '../../utils/status';

describe('Utility Functions', () => {

  describe('pickValue', () => {
    it('should return first matching key value', () => {
      const entry = { title: 'Test Title', name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Title');
    });

    it('should return second key if first is missing', () => {
      const entry = { name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Name');
    });

    it('should return fallback if no keys match', () => {
      const entry = { something: 'value' };
      const result = pickValue(entry, ['title', 'name'], 'fallback');
      assert.strictEqual(result, 'fallback');
    });

    it('should skip undefined values', () => {
      const entry = { title: undefined, name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Name');
    });

    it('should convert non-string values to string', () => {
      const entry = { priority: 123 };
      const result = pickValue(entry, ['priority']);
      assert.strictEqual(result, '123');
    });
  });

  describe('pickFirstKey', () => {
    it('should return value and key for first match', () => {
      const entry = { id: '123', uuid: '456' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, { value: '123', key: 'id' });
    });

    it('should return empty object if no match', () => {
      const entry = { something: 'value' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, {});
    });

    it('should skip undefined values', () => {
      const entry = { id: undefined, uuid: '456' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, { value: '456', key: 'uuid' });
    });
  });

  describe('pickTags', () => {
    it('should extract tags from labels array', () => {
      const entry = { labels: ['bug', 'feature'] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature']);
    });

    it('should extract tags from tags array', () => {
      const entry = { tags: ['bug', 'feature'] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature']);
    });

    it('should parse comma-separated string', () => {
      const entry = { labels: 'bug, feature, enhancement' };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature', 'enhancement']);
    });

    it('should return undefined for missing tags', () => {
      const entry = { title: 'Test' };
      const result = pickTags(entry);
      assert.strictEqual(result, undefined);
    });

    it('should convert non-string array items to strings', () => {
      const entry = { labels: [1, 2, 3] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['1', '2', '3']);
    });
  });

  describe('pickAssignee', () => {
    it('returns direct assignee string when present', () => {
      const entry = { assignee: 'Alice' };
      assert.strictEqual(pickAssignee(entry), 'Alice');
    });

    it('extracts nested assignee name object', () => {
      const entry = { assigned_to: { name: 'Bob Builder' } } as any;
      assert.strictEqual(pickAssignee(entry), 'Bob Builder');
    });

    it('returns undefined when no assignee present', () => {
      const entry = { title: 'No owner' };
      assert.strictEqual(pickAssignee(entry), undefined);
    });
  });

  describe('normalizeBead', () => {
    it('should normalize bead with all fields', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        file: 'test.md',
        status: 'open',
        labels: ['bug', 'feature'],
        external_ref: 'EXT-123'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.id, 'BEAD-1');
      assert.strictEqual(result.title, 'Test Bead');
      assert.strictEqual(result.filePath, 'test.md');
      assert.strictEqual(result.status, 'open');
      assert.deepStrictEqual(result.tags, ['bug', 'feature']);
      assert.strictEqual(result.externalReferenceId, 'EXT-123');
      assert.strictEqual(result.externalReferenceDescription, undefined);
      assert.strictEqual(result.raw, entry);
    });

    it('should parse external_ref with description', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        external_ref: 'ERE-1835:external-id-contracts'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.externalReferenceId, 'ERE-1835');
      assert.strictEqual(result.externalReferenceDescription, 'external-id-contracts');
    });

    it('should handle external_ref with only ID', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        external_ref: 'EXT-123'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.externalReferenceId, 'EXT-123');
      assert.strictEqual(result.externalReferenceDescription, undefined);
    });

    it('should generate fallback id if missing', () => {
      const entry = { title: 'Test' };
      const result = normalizeBead(entry, 5);
      assert.strictEqual(result.id, 'bead-5');
    });

    it('should use id as title fallback if title is missing', () => {
      const entry = { id: 'BEAD-1' };
      const result = normalizeBead(entry, 3);
      assert.strictEqual(result.title, 'BEAD-1');
    });

    it('should generate fallback title if both id and title are missing', () => {
      const entry = {};
      const result = normalizeBead(entry, 3);
      assert.strictEqual(result.title, 'bead-3');
    });

    it('should handle alternative field names', () => {
      const entry = {
        uuid: 'unique-id',
        name: 'Alternative Name',
        path: '/path/to/file',
        state: 'closed',
        externalReferenceId: 'REF-456'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.id, 'unique-id');
      assert.strictEqual(result.title, 'Alternative Name');
      assert.strictEqual(result.filePath, '/path/to/file');
      assert.strictEqual(result.status, 'closed');
      assert.strictEqual(result.externalReferenceId, 'REF-456');
    });

    it('should extract issueType from issue_type field', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Epic',
        issue_type: 'epic'
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.issueType, 'epic');
    });

    it('should extract issueType from issueType field', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Task',
        issueType: 'task'
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.issueType, 'task');
    });

    it('should extract issueType from type field', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bug',
        type: 'bug'
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.issueType, 'bug');
    });

    it('should handle missing issueType gracefully', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'No Type'
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.issueType, undefined);
    });

    it('should extract parentId from parent-child dependencies', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Child Task',
        dependencies: [
          { issue_id: 'TASK-1', depends_on_id: 'EPIC-1', type: 'parent-child' }
        ]
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, 'EPIC-1');
    });

    it('should handle items with no dependencies', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Standalone Task'
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, undefined);
    });

    it('should handle items with empty dependencies array', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Standalone Task',
        dependencies: []
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, undefined);
    });

    it('should handle items with only blocking deps (no parent)', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Blocked Task',
        dependencies: [
          { issue_id: 'TASK-1', depends_on_id: 'TASK-2', type: 'blocks' }
        ]
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, undefined);
      assert.strictEqual(result.blockingDepsCount, 1);
    });

    it('should handle items with both blocking and parent-child deps', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Task with Both',
        dependencies: [
          { issue_id: 'TASK-1', depends_on_id: 'EPIC-1', type: 'parent-child' },
          { issue_id: 'TASK-1', depends_on_id: 'TASK-2', type: 'blocks' }
        ]
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, 'EPIC-1');
      assert.strictEqual(result.blockingDepsCount, 1);
    });

    it('should extract parentId using dep_type field alternative', () => {
      const entry = {
        id: 'TASK-1',
        title: 'Child Task',
        dependencies: [
          { issue_id: 'TASK-1', depends_on_id: 'EPIC-1', dep_type: 'parent-child' }
        ]
      };
      const result = normalizeBead(entry, 0);
      assert.strictEqual(result.parentId, 'EPIC-1');
    });
  });

  describe('extractBeads', () => {
    it('should return array if root is array', () => {
      const root = [{ id: '1' }, { id: '2' }];
      const result = extractBeads(root);
      assert.deepStrictEqual(result, root);
    });

    it('should extract beads from root.beads', () => {
      const beads = [{ id: '1' }, { id: '2' }];
      const root = { beads };
      const result = extractBeads(root);
      assert.deepStrictEqual(result, beads);
    });

    it('should extract beads from root.project.beads', () => {
      const beads = [{ id: '1' }, { id: '2' }];
      const root = { project: { beads } };
      const result = extractBeads(root);
      assert.deepStrictEqual(result, beads);
    });

    it('should return undefined for invalid structure', () => {
      const root = { something: 'else' };
      const result = extractBeads(root);
      assert.strictEqual(result, undefined);
    });
  });

  describe('resolveDataFilePath', () => {
    it('should return absolute path as-is', () => {
      const result = resolveDataFilePath('/absolute/path/data.jsonl', '/project');
      assert.strictEqual(result, '/absolute/path/data.jsonl');
    });

    it('should join relative path with project root', () => {
      const result = resolveDataFilePath('.beads/issues.jsonl', '/project');
      assert.strictEqual(result, path.join('/project', '.beads/issues.jsonl'));
    });

    it('should return undefined if dataFile is empty', () => {
      const result = resolveDataFilePath('', '/project');
      assert.strictEqual(result, undefined);
    });

    it('should return undefined if projectRoot is missing for relative path', () => {
      const result = resolveDataFilePath('.beads/issues.jsonl', undefined);
      assert.strictEqual(result, undefined);
    });
  });

  describe('formatError', () => {
    it('should format Error object with message', () => {
      const error = new Error('Test error');
      const result = formatError('Operation failed', error);
      assert.strictEqual(result, 'Operation failed: Test error');
    });

    it('should return prefix for non-Error objects', () => {
      const result = formatError('Operation failed', 'some string');
      assert.strictEqual(result, 'Operation failed');
    });
  });

  describe('sanitizeInlineText', () => {
    it('strips tags, newlines, and collapses whitespace', () => {
      const dirty = ' <b>Hello</b>\nworld <script>alert(1)</script> ';
      assert.strictEqual(sanitizeInlineText(dirty), 'Hello world');
    });

    it('returns empty string for undefined input', () => {
      assert.strictEqual(sanitizeInlineText(undefined as any), '');
    });
  });

  describe('formatStatusLabel', () => {
    it('humanizes known statuses', () => {
      assert.strictEqual(formatStatusLabel('in_progress'), 'In Progress');
      assert.strictEqual(formatStatusLabel('open'), 'Open');
    });

    it('falls back to original string for unknown status', () => {
      assert.strictEqual(formatStatusLabel('paused'), 'paused');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const result = escapeHtml('<div>Test & "quotes"</div>');
      assert.strictEqual(result, '&lt;div&gt;Test &amp; &quot;quotes&quot;&lt;/div&gt;');
    });

    it('should handle empty string', () => {
      const result = escapeHtml('');
      assert.strictEqual(result, '');
    });

    it('should handle string with no special chars', () => {
      const result = escapeHtml('plain text');
      assert.strictEqual(result, 'plain text');
    });
  });

  describe('linkifyText', () => {
    it('should convert URLs to clickable links', () => {
      const result = linkifyText('Check out https://example.com for more info');
      assert.strictEqual(result, 'Check out <a href="https://example.com" class="external-link" target="_blank">https://example.com</a> for more info');
    });

    it('should handle multiple URLs', () => {
      const result = linkifyText('Visit https://example.com and https://test.com');
      assert.strictEqual(result, 'Visit <a href="https://example.com" class="external-link" target="_blank">https://example.com</a> and <a href="https://test.com" class="external-link" target="_blank">https://test.com</a>');
    });

    it('should handle text with no URLs', () => {
      const result = linkifyText('plain text with no links');
      assert.strictEqual(result, 'plain text with no links');
    });

    it('should escape HTML while preserving URLs', () => {
      const result = linkifyText('<script>alert("xss")</script> https://example.com');
      assert.strictEqual(result, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; <a href="https://example.com" class="external-link" target="_blank">https://example.com</a>');
    });

    it('should handle http and https URLs', () => {
      const result = linkifyText('http://example.com and https://secure.com');
      assert.strictEqual(result, '<a href="http://example.com" class="external-link" target="_blank">http://example.com</a> and <a href="https://secure.com" class="external-link" target="_blank">https://secure.com</a>');
    });

    it('should handle URLs with paths and query strings', () => {
      const result = linkifyText('https://linear.app/ereborbank/issue/ERE-1718/implement-statement-correction');
      assert.strictEqual(result, '<a href="https://linear.app/ereborbank/issue/ERE-1718/implement-statement-correction" class="external-link" target="_blank">https://linear.app/ereborbank/issue/ERE-1718/implement-statement-correction</a>');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return empty string for undefined', () => {
      const result = formatRelativeTime(undefined);
      assert.strictEqual(result, '');
    });

    it('should return "just now" for very recent times', () => {
      const now = new Date();
      const result = formatRelativeTime(now.toISOString());
      assert.strictEqual(result, 'just now');
    });

    it('should return minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const result = formatRelativeTime(date.toISOString());
      assert.strictEqual(result, '5m ago');
    });

    it('should return hours ago', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      const result = formatRelativeTime(date.toISOString());
      assert.strictEqual(result, '3h ago');
    });

    it('should return days ago', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const result = formatRelativeTime(date.toISOString());
      assert.strictEqual(result, '2d ago');
    });

    it('should return weeks ago', () => {
      const date = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000); // 2 weeks ago
      const result = formatRelativeTime(date.toISOString());
      assert.strictEqual(result, '2w ago');
    });

    it('should return months ago for older dates', () => {
      const date = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      const result = formatRelativeTime(date.toISOString());
      assert.strictEqual(result, '2mo ago');
    });
  });

  describe('isStale', () => {
    const createBead = (status: string, inProgressSince?: string): BeadItemData => ({
      id: 'test-1',
      idKey: 'test-1',
      title: 'Test Task',
      status,
      inProgressSince,
      raw: {}
    });

    it('should return false for non-in_progress tasks', () => {
      const bead = createBead('open');
      assert.strictEqual(isStale(bead), false);
    });

    it('should return false for closed tasks', () => {
      const bead = createBead('closed');
      assert.strictEqual(isStale(bead), false);
    });

    it('should return false for in_progress tasks without inProgressSince', () => {
      const bead = createBead('in_progress');
      assert.strictEqual(isStale(bead), false);
    });

    it('should return false for recently started in_progress tasks', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const bead = createBead('in_progress', oneHourAgo.toISOString());
      assert.strictEqual(isStale(bead), false);
    });

    it('should return true for tasks in progress longer than default threshold', () => {
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const bead = createBead('in_progress', thirtyHoursAgo.toISOString());
      assert.strictEqual(isStale(bead), true);
    });

    it('should respect custom threshold', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const bead = createBead('in_progress', threeHoursAgo.toISOString());
      // Not stale with 4 hour threshold
      assert.strictEqual(isStale(bead, 4), false);
      // Stale with 2 hour threshold
      assert.strictEqual(isStale(bead, 2), true);
    });

    it('should have default threshold of 24 hours', () => {
      assert.strictEqual(DEFAULT_STALE_THRESHOLD_HOURS, 24);
    });
  });

  describe('getStaleInfo', () => {
    const createBead = (status: string, inProgressSince?: string): BeadItemData => ({
      id: 'test-1',
      idKey: 'test-1',
      title: 'Test Task',
      status,
      inProgressSince,
      raw: {}
    });

    it('should return undefined for non-in_progress tasks', () => {
      const bead = createBead('open');
      assert.strictEqual(getStaleInfo(bead), undefined);
    });

    it('should return undefined for in_progress without inProgressSince', () => {
      const bead = createBead('in_progress');
      assert.strictEqual(getStaleInfo(bead), undefined);
    });

    it('should return info for in_progress tasks with timestamp', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const bead = createBead('in_progress', twoHoursAgo.toISOString());
      const info = getStaleInfo(bead);
      assert.ok(info);
      assert.ok(info.hoursInProgress >= 1.9 && info.hoursInProgress <= 2.1);
      assert.strictEqual(info.formattedTime, '2h');
    });

    it('should format days and hours correctly', () => {
      const twoDaysThreeHoursAgo = new Date(Date.now() - (2 * 24 + 3) * 60 * 60 * 1000);
      const bead = createBead('in_progress', twoDaysThreeHoursAgo.toISOString());
      const info = getStaleInfo(bead);
      assert.ok(info);
      assert.strictEqual(info.formattedTime, '2d 3h');
    });

    it('should format days only when no extra hours', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const bead = createBead('in_progress', threeDaysAgo.toISOString());
      const info = getStaleInfo(bead);
      assert.ok(info);
      assert.strictEqual(info.formattedTime, '3d');
    });

    it('should format minutes for very short durations', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      const bead = createBead('in_progress', thirtyMinsAgo.toISOString());
      const info = getStaleInfo(bead);
      assert.ok(info);
      assert.strictEqual(info.formattedTime, '30m');
    });
  });
});
