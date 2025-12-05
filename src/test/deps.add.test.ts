import * as assert from 'assert';
import { BeadItemData } from '@beads/core';
import { hasDependency, validateDependencyAdd, validateDependencyAddWithReason } from '../utils/dependencies';

function bead(id: string, deps: string[] = []): BeadItemData {
  return {
    id,
    title: id,
    raw: {
      dependencies: deps.map((d) => ({ depends_on_id: d })),
    },
  } as BeadItemData;
}

describe('Dependency validation', () => {
  it('returns reason codes for invalid dependencies', () => {
    const items = [bead('A'), bead('B', ['A'])];

    const self = validateDependencyAddWithReason(items, 'A', 'A');
    assert.deepStrictEqual(self, { ok: false, reason: 'self' });

    const duplicate = validateDependencyAddWithReason([bead('A', ['B']), bead('B')], 'A', 'B');
    assert.deepStrictEqual(duplicate, { ok: false, reason: 'duplicate' });

    const cycle = validateDependencyAddWithReason(items, 'A', 'B');
    assert.deepStrictEqual(cycle, { ok: false, reason: 'cycle' });

    const validItems = [bead('A'), bead('B')];
    const valid = validateDependencyAddWithReason(validItems, 'B', 'A');
    assert.deepStrictEqual(valid, { ok: true });
  });

  it('maps reasons to user-friendly messages', () => {
    const items = [bead('A')];
    const message = validateDependencyAdd(items, 'A', 'A');
    assert.ok(message?.toLowerCase().includes('same issue'));
  });

  it('hasDependency detects existing edge', () => {
    const items = [bead('A', ['B']), bead('B')];
    assert.ok(hasDependency(items, 'A', 'B'));
    assert.ok(!hasDependency(items, 'B', 'A'));
  });
});
