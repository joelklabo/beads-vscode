import assert from 'node:assert';
import { test } from 'node:test';
import { sanitizeDependencyId, normalizeDependencyType } from '../src/dependencies';

test('sanitizeDependencyId trims and validates ids', () => {
  assert.strictEqual(sanitizeDependencyId(' BD-123 '), 'BD-123');
  assert.strictEqual(sanitizeDependencyId('feature_1'), 'feature_1');
  assert.strictEqual(sanitizeDependencyId('with.dot'), 'with.dot');
  assert.strictEqual(sanitizeDependencyId(''), undefined);
  assert.strictEqual(sanitizeDependencyId('toolong'.repeat(20)), undefined);
  assert.strictEqual(sanitizeDependencyId('bad spaces in id'), undefined);
  assert.strictEqual(sanitizeDependencyId('bad\nline'), undefined);
});

test('normalizeDependencyType maps aliases', () => {
  assert.strictEqual(normalizeDependencyType('blocks'), 'blocks');
  assert.strictEqual(normalizeDependencyType('block'), 'blocks');
  assert.strictEqual(normalizeDependencyType('parent_child'), 'parent-child');
  assert.strictEqual(normalizeDependencyType('parentChild'), 'parent-child');
  assert.strictEqual(normalizeDependencyType('related'), 'related');
  assert.strictEqual(normalizeDependencyType('unknown'), 'related');
});
