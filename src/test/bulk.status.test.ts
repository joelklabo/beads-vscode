import * as assert from 'assert';
import { buildBulkSelection, executeBulkStatusUpdate } from '../utils/bulk';
import { BeadItemData } from '../utils/beads';

describe('Bulk status helpers', () => {
  it('dedupes selection and enforces max selection', () => {
    const beads: BeadItemData[] = [
      { id: 'A' } as BeadItemData,
      { id: 'B' } as BeadItemData,
      { id: 'A' } as BeadItemData,
    ];

    const { ids, error } = buildBulkSelection(beads, 3);
    assert.deepStrictEqual(ids, ['A', 'B']);
    assert.strictEqual(error, undefined);

    const limited = buildBulkSelection(beads, 1);
    assert.ok(limited.error?.includes('1'));
    assert.deepStrictEqual(limited.ids, ['A', 'B']);
  });

  it('continues after failures and reports details', async () => {
    const calls: string[] = [];
    const result = await executeBulkStatusUpdate(
      ['ok-1', 'fail-me', 'ok-2'],
      'closed',
      async (id: string) => {
        calls.push(id);
        if (id === 'fail-me') {
          throw new Error('boom');
        }
      }
    );

    assert.deepStrictEqual(calls, ['ok-1', 'fail-me', 'ok-2']);
    assert.deepStrictEqual(result.successes, ['ok-1', 'ok-2']);
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].id, 'fail-me');
    assert.ok(result.failures[0].error.includes('boom'));
  });

  it('reports progress for each item', async () => {
    const steps: Array<{ completed: number; total: number }> = [];

    await executeBulkStatusUpdate(
      ['one', 'two'],
      'open',
      async () => Promise.resolve(),
      (completed, total) => steps.push({ completed, total })
    );

    assert.deepStrictEqual(steps, [
      { completed: 1, total: 2 },
      { completed: 2, total: 2 }
    ]);
  });
});
