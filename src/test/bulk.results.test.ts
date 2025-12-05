import * as assert from 'assert';
import { summarizeBulkResult } from '../utils/bulk';

describe('Bulk result summary', () => {
  it('handles all successes', () => {
    const result = summarizeBulkResult({ successes: ['A', 'B'], failures: [] });

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.successCount, 2);
    assert.strictEqual(result.failureCount, 0);
    assert.deepStrictEqual(result.failureIds, []);
    assert.strictEqual(result.failureList, '');
  });

  it('formats failures with ids and errors', () => {
    const result = summarizeBulkResult({
      successes: ['X'],
      failures: [
        { id: 'Y', error: 'timeout' },
        { id: 'Z', error: 'forbidden' },
      ],
    });

    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.failureCount, 2);
    assert.deepStrictEqual(result.failureIds, ['Y', 'Z']);
    assert.strictEqual(result.failureList, 'Y: timeout; Z: forbidden');
  });
});
