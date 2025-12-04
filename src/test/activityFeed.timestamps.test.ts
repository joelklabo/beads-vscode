import * as assert from 'assert';
import { formatRelativeTimeDetailed, getTimeGroup } from '../activityFeed';
import { parseUtcDate } from '../utils/format';

describe('Activity feed timestamps', () => {
  it('parses UTC and naive timestamps as UTC', () => {
    const iso = parseUtcDate('2024-01-02T12:00:00Z');
    const naive = parseUtcDate('2024-01-02T12:00:00');
    const sqliteStyle = parseUtcDate('2024-01-02 12:00:00');

    assert.strictEqual(iso.toISOString(), '2024-01-02T12:00:00.000Z');
    assert.strictEqual(naive.toISOString(), '2024-01-02T12:00:00.000Z');
    assert.strictEqual(sqliteStyle.toISOString(), '2024-01-02T12:00:00.000Z');
  });

  it('honors timezone offsets in timestamps', () => {
    const offset = parseUtcDate('2024-01-02T12:00:00-05:00');
    assert.strictEqual(offset.toISOString(), '2024-01-02T17:00:00.000Z');

    const dst = parseUtcDate('2024-03-10T02:30:00-05:00'); // pre-DST switch in US/Eastern
    assert.strictEqual(dst.toISOString(), '2024-03-10T07:30:00.000Z');
  });

  it('formats relative time deterministically with injected "now"', () => {
    const now = new Date(Date.UTC(2024, 5, 1, 12, 0, 0));
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const tenSecondsAgo = new Date(now.getTime() - 10 * 1000);
    const yesterday = new Date(now.getTime() - 26 * 60 * 60 * 1000);

    assert.strictEqual(formatRelativeTimeDetailed(tenSecondsAgo, now), 'just now');
    assert.strictEqual(formatRelativeTimeDetailed(oneHourAgo, now), '1 hour ago');
    assert.ok(formatRelativeTimeDetailed(yesterday, now).startsWith('yesterday'), 'should label yesterday');
  });

  it('groups events by local day boundaries using provided "now"', () => {
    const now = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
    const todayEvent = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const yesterdayEvent = new Date(now.getTime() - 26 * 60 * 60 * 1000);
    const olderEvent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    assert.strictEqual(getTimeGroup(todayEvent, now), 'Today');
    assert.strictEqual(getTimeGroup(yesterdayEvent, now), 'Yesterday');
    assert.strictEqual(getTimeGroup(olderEvent, now), 'This Month');
  });
});
