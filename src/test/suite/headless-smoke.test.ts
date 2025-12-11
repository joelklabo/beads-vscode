import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';

function sanitize(raw: string): string {
  const noSeparators = raw.replace(/[\\/]/g, '-');
  const safe = noSeparators.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 64);
  return safe.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
}

suite('Headless harness smoke', () => {
  test('uses isolated temp dirs tied to instance id', async () => {
    const userArg = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
    const extArg = process.argv.find((arg) => arg.startsWith('--extensions-dir='));

    assert.ok(userArg, 'runTest should pass --user-data-dir');
    assert.ok(extArg, 'runTest should pass --extensions-dir');
    if (!userArg || !extArg) {
      return;
    }

    const userDir = userArg.split('=')[1] ?? '';
    const extDir = extArg.split('=')[1] ?? '';
    const baseDir = path.dirname(userDir);
    const baseName = path.basename(baseDir);

    assert.notStrictEqual(userDir, extDir, 'user and extensions dirs must differ');
    assert.strictEqual(path.dirname(extDir), baseDir, 'both dirs share the same base');

    const instanceId = process.env.VSCODE_TEST_INSTANCE_ID;
    if (instanceId) {
      const expectedSlug = sanitize(instanceId);
      assert.ok(
        baseName.startsWith(`beady-${expectedSlug}-`),
        'base dir should include sanitized instance id',
      );
    } else {
      assert.ok(baseName.startsWith('beady-'), 'base dir should follow beads prefix');
    }

    // Ensure directories exist during the test run
    await Promise.all([
      fs.stat(userDir),
      fs.stat(extDir),
    ]);
  });
});
