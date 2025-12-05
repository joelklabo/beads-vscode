import * as assert from 'assert';
import { applyQuickFilter, normalizeQuickFilter } from '../../utils/filters';
import { sanitizeInlineText } from '../../utils/sanitize';
import { BeadItemData } from '../../utils/beads';

describe('Quick filter sanitization', () => {
  const sampleItem: BeadItemData = {
    id: 'TASK-1',
    title: 'Sample',
    issueType: 'task',
    status: 'open',
    raw: { labels: ['Core', 'frontend'] } as any,
  } as any;

  it('drops invalid status filters and leaves items unchanged', () => {
    const filtered = applyQuickFilter([sampleItem], { kind: 'status', value: '<script>' as any });
    assert.strictEqual(filtered.length, 1);
  });

  it('rejects disallowed status values', () => {
    const normalized = normalizeQuickFilter({ kind: 'status', value: 'done' as any });
    assert.strictEqual(normalized, undefined);
  });

  it('sanitizes label filter values', () => {
    const normalized = normalizeQuickFilter({ kind: 'label', value: '<img src=x onerror=1>core' });
    assert.ok(normalized);
    assert.strictEqual(normalized?.kind, 'label');
    assert.ok(normalized?.value && !normalized.value.includes('<'));
  });

  it('matches labels using sanitized value case-insensitively', () => {
    const filtered = applyQuickFilter([sampleItem], { kind: 'label', value: '<b>CORE</b>' });
    assert.deepStrictEqual(filtered.map((i) => i.id), ['TASK-1']);
  });

  it('trims and sanitizes label values before matching', () => {
    const filtered = applyQuickFilter([sampleItem], { kind: 'label', value: '   core   ' });
    assert.deepStrictEqual(filtered.map((i) => i.id), ['TASK-1']);
  });

  it('filters only labeled items when label value omitted', () => {
    const unlabeled: BeadItemData = { id: 'TASK-2', title: 'No labels', raw: {} as any } as any;
    const filtered = applyQuickFilter([sampleItem, unlabeled], { kind: 'label' });
    assert.deepStrictEqual(filtered.map((i) => i.id), ['TASK-1']);
  });

  it('ignores unknown quick filter kinds safely', () => {
    const filtered = applyQuickFilter([sampleItem], { kind: 'weird' as any });
    assert.deepStrictEqual(filtered, [sampleItem]);
  });
});

describe('sanitizeInlineText', () => {
  it('strips HTML tags and newlines', () => {
    const sanitized = sanitizeInlineText('<img src=x onerror=alert(1)>Hello\nWorld');
    assert.strictEqual(sanitized, 'Hello World');
  });
});
