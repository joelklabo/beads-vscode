import * as assert from 'assert';
import { BeadItemData } from '../utils/beads';
import { validateDependencyAdd, hasDependency } from '../utils/dependencies';

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
  it('rejects self-dependency', () => {
    const items = [bead('A')];
    const error = validateDependencyAdd(items, 'A', 'A');
    assert.ok(error && error.includes('same issue'));
  });

  it('rejects duplicate dependency', () => {
    const items = [bead('A', ['B']), bead('B')];
    const error = validateDependencyAdd(items, 'A', 'B');
    assert.ok(error && error.includes('already exists'));
  });

  it('rejects cycles', () => {
    const items = [bead('A'), bead('B', ['A'])];
    const error = validateDependencyAdd(items, 'A', 'B');
    assert.ok(error && error.includes('cycle'));
  });

  it('allows new valid dependency', () => {
    const items = [bead('A'), bead('B')];
    const error = validateDependencyAdd(items, 'A', 'B');
    assert.strictEqual(error, undefined);
  });

  it('hasDependency detects existing edge', () => {
    const items = [bead('A', ['B']), bead('B')];
    assert.ok(hasDependency(items, 'A', 'B'));
    assert.ok(!hasDependency(items, 'B', 'A'));
  });
});
