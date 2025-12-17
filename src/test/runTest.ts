import * as path from 'path';
import * as fs from 'fs/promises';
import { runTests } from '@vscode/test-electron';
import { buildTestEnv } from './utils/env';
import './setup/resolve-extension';

async function main(): Promise<void> {
  const keepDirs = process.env.BEADY_TEST_KEEP_DIRS === '1';
  let cleanupTargets: string[] = [];
  try {
    const testEnv = await buildTestEnv();
    cleanupTargets = [
      testEnv.userDataDir,
      testEnv.extensionsDir,
      path.dirname(testEnv.userDataDir),
    ];

    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      version: testEnv.channel === 'insiders' ? 'insider' : 'stable',
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        BEADY_TEST_USER_DATA_DIR: testEnv.userDataDir,
        BEADY_TEST_EXTENSIONS_DIR: testEnv.extensionsDir,
      },
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
    process.exitCode = 1;
  } finally {
    if (!keepDirs) {
      const uniqueTargets = Array.from(new Set(cleanupTargets));
      await Promise.allSettled(
        uniqueTargets.map((target) => fs.rm(target, { recursive: true, force: true })),
      );
    }
  }
}

void main();
