import * as assert from 'assert';
import { isCliVersionAtLeast, parseCliVersion } from '../../utils/cli';

describe('CLI version helpers', () => {
  it('parses semantic versions', () => {
    const parsed = parseCliVersion('0.29.1');
    assert.deepStrictEqual(parsed, { raw: '0.29.1', major: 0, minor: 29, patch: 1 });
  });

  it('handles noisy version output', () => {
    const parsed = parseCliVersion('bd version 0.30.0\n');
    assert.strictEqual(parsed.major, 0);
    assert.strictEqual(parsed.minor, 30);
    assert.strictEqual(parsed.patch, 0);
  });

  it('falls back to zeros on invalid input', () => {
    const parsed = parseCliVersion('unknown');
    assert.deepStrictEqual(parsed, { raw: 'unknown', major: 0, minor: 0, patch: 0 });
  });

  it('compares versions correctly', () => {
    assert.ok(isCliVersionAtLeast('0.30.0', '0.29.0'));
    assert.ok(isCliVersionAtLeast('1.0.0', '0.99.99'));
    assert.ok(isCliVersionAtLeast('0.29.0', '0.29.0'));
    assert.ok(!isCliVersionAtLeast('0.28.9', '0.29.0'));
    assert.ok(!isCliVersionAtLeast('0.29.0', '0.29.1'));
  });
});
