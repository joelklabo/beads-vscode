import * as assert from 'assert';
import { applyQuickFilter, toggleQuickFilter, QuickFilterPreset } from '../../utils/filters';
import { BeadItemData } from '../../utils';

describe('Quick filter presets', () => {
  const items: BeadItemData[] = [
    { id: 'A', title: 'Open item', status: 'open', raw: { labels: [] } as any } as BeadItemData,
    { id: 'B', title: 'Closed item', status: 'closed', raw: { labels: ['done'] } as any } as BeadItemData,
    { id: 'C', title: 'Blocked item', status: 'blocked', raw: { labels: [] } as any } as BeadItemData,
    { id: 'D', title: 'Stale item', status: 'in_progress', inProgressSince: '2024-01-01T00:00:00Z', raw: { labels: ['wip'] } as any } as BeadItemData,
  ];

  it('filters by status', () => {
    const filtered = applyQuickFilter(items, { kind: 'status', value: 'blocked' });
    assert.deepStrictEqual(filtered.map((i) => i.id), ['C']);
  });

  it('filters by labeled items', () => {
    const filtered = applyQuickFilter(items, { kind: 'label' });
    assert.deepStrictEqual(filtered.map((i) => i.id).sort(), ['B', 'D']);
  });

  it('filters stale items', () => {
    const filtered = applyQuickFilter(items, { kind: 'stale' });
    assert.deepStrictEqual(filtered.map((i) => i.id), ['D']);
  });

  it('toggles same preset off', () => {
    const current: QuickFilterPreset = { kind: 'status', value: 'open' };
    const next = toggleQuickFilter(current, { kind: 'status', value: 'open' });
    assert.strictEqual(next, undefined);
  });

  it('switches to different preset', () => {
    const current: QuickFilterPreset = { kind: 'status', value: 'open' };
    const next = toggleQuickFilter(current, { kind: 'label' });
    assert.deepStrictEqual(next, { kind: 'label' });
  });
});
