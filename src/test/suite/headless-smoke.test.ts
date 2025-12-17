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
    const userDir =
      process.env.BEADY_TEST_USER_DATA_DIR ||
      process.argv.find((arg) => arg.startsWith('--user-data-dir='))?.split('=')[1] ||
      '';
    const extDir =
      process.env.BEADY_TEST_EXTENSIONS_DIR ||
      process.argv.find((arg) => arg.startsWith('--extensions-dir='))?.split('=')[1] ||
      '';

    assert.ok(userDir, 'runTest should pass user-data-dir (argv or env)');
    assert.ok(extDir, 'runTest should pass extensions-dir (argv or env)');
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
