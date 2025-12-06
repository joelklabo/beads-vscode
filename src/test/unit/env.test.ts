import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { buildTestEnv } from '../utils/env';

function sanitize(expectedRaw: string): string {
  const INSTANCE_ID_MAX = 64;
  const noSeparators = expectedRaw.replace(/[\\/]/g, '-');
  const safe = noSeparators.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, INSTANCE_ID_MAX);
  return safe.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
}

describe('buildTestEnv', () => {
  const originalEnv = { ...process.env };
  const tmpRoot = path.join(path.resolve(__dirname, '../../..'), 'tmp');

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to stable channel when unset or invalid', async () => {
    delete process.env.VSCODE_TEST_CHANNEL;
    let env = await buildTestEnv();
    assert.strictEqual(env.channel, 'stable');

    process.env.VSCODE_TEST_CHANNEL = 'unknown-channel';
    env = await buildTestEnv();
    assert.strictEqual(env.channel, 'stable');

    await fs.rm(path.dirname(env.userDataDir), { recursive: true, force: true });
  });

  it('accepts insiders channel case-insensitively', async () => {
    process.env.VSCODE_TEST_CHANNEL = 'InSiDeRs ';
    const env = await buildTestEnv();
    assert.strictEqual(env.channel, 'insiders');
    await fs.rm(path.dirname(env.userDataDir), { recursive: true, force: true });
  });

  it('sanitizes instance id and places temp dirs under repo tmp', async () => {
    process.env.VSCODE_TEST_INSTANCE_ID = 'abc/../Weird$$ID::segment';
    const env = await buildTestEnv();

    const baseDir = path.dirname(env.userDataDir);
    const baseName = path.basename(baseDir);
    const expectedSlug = sanitize(process.env.VSCODE_TEST_INSTANCE_ID!);

    assert.ok(baseDir.startsWith(tmpRoot), 'temp base should live under repo tmp/');
    assert.ok(baseName.startsWith(`beady-${expectedSlug}-`));
    assert.strictEqual(path.dirname(env.extensionsDir), baseDir, 'shared base for isolation');
    assert.notStrictEqual(env.userDataDir, env.extensionsDir, 'distinct dirs');

    // Ensure extra args include focus-suppression flags
    assert.ok(env.extraLaunchArgs.includes('--disable-features=CalculateNativeWinOcclusion'));
    assert.ok(env.extraLaunchArgs.includes('--disable-renderer-backgrounding'));

    await fs.rm(baseDir, { recursive: true, force: true });
  });
});
