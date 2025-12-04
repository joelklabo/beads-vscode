import * as assert from 'assert';
import { validateLittleGlenMessage, isValidBeadId } from '../littleGlen/validation';

describe('Little Glen command validation', () => {
  it('accepts valid openBead command', () => {
    const msg = validateLittleGlenMessage({ command: 'openBead', beadId: 'ABC-123' }, ['openBead']);
    assert.ok(msg);
    assert.strictEqual(msg!.command, 'openBead');
    assert.strictEqual(msg!['beadId'], 'ABC-123');
  });

  it('rejects openBead with invalid id', () => {
    const msg = validateLittleGlenMessage({ command: 'openBead', beadId: 'javascript:alert(1)' }, ['openBead']);
    assert.strictEqual(msg, undefined);
  });

  it('rejects unknown commands', () => {
    const msg = validateLittleGlenMessage({ command: 'doThings', beadId: 'X' });
    assert.strictEqual(msg, undefined);
  });

  it('allows only http/https URLs for openExternalUrl', () => {
    const good = validateLittleGlenMessage({ command: 'openExternalUrl', url: 'https://example.com' }, ['openExternalUrl']);
    assert.ok(good);
    const bad = validateLittleGlenMessage({ command: 'openExternalUrl', url: 'javascript:alert(1)' }, ['openExternalUrl']);
    assert.strictEqual(bad, undefined);
  });

  it('enforces max lengths for labels and titles', () => {
    const longLabel = 'a'.repeat(70);
    const longTitle = 'b'.repeat(300);
    const labelResult = validateLittleGlenMessage({ command: 'addLabel', label: longLabel });
    const titleResult = validateLittleGlenMessage({ command: 'updateTitle', title: longTitle });
    assert.strictEqual(labelResult, undefined);
    assert.strictEqual(titleResult, undefined);
  });

  it('validates bead id helper', () => {
    assert.ok(isValidBeadId('ABC_123-xyz'));
    assert.ok(!isValidBeadId(''));
    assert.ok(!isValidBeadId('a'.repeat(80)));
    assert.ok(!isValidBeadId('abc space'));
  });
});
