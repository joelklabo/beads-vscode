import * as path from 'path';
import * as fs from 'fs/promises';
import { runTests } from '@vscode/test-electron';
import { buildTestEnv } from './utils/env';

async function main(): Promise<void> {
  const testEnv = await buildTestEnv();

  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      version: testEnv.channel === 'insiders' ? 'insider' : 'stable',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--log=error',
        `--user-data-dir=${testEnv.userDataDir}`,
        `--extensions-dir=${testEnv.extensionsDir}`,
        ...testEnv.extraLaunchArgs,
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  } finally {
    // Best-effort cleanup of temp dirs
    await Promise.allSettled([
      fs.rm(testEnv.userDataDir, { recursive: true, force: true }),
      fs.rm(testEnv.extensionsDir, { recursive: true, force: true }),
    ]);
  }
}

void main();
