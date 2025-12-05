import * as assert from 'assert';
import { validateLittleGlenMessage } from '../../littleGlen/validation';

describe('Little Glen validation (delete)', () => {
  it('accepts deleteBead with valid id when allowed', () => {
    const msg = validateLittleGlenMessage({ command: 'deleteBead', beadId: 'ABC-1' }, ['deleteBead']);
    assert.ok(msg);
    assert.strictEqual(msg?.command, 'deleteBead');
    assert.strictEqual((msg as any).beadId, 'ABC-1');
  });

  it('rejects deleteBead with invalid id', () => {
    const msg = validateLittleGlenMessage({ command: 'deleteBead', beadId: 'bad id' }, ['deleteBead']);
    assert.strictEqual(msg, undefined);
  });

  it('rejects deleteBead when not allowed by context', () => {
    const msg = validateLittleGlenMessage({ command: 'deleteBead', beadId: 'ABC-1' }, ['openBead']);
    assert.strictEqual(msg, undefined);
  });
});
