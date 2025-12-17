import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '.');

  const files = await glob('**/**.test.js', { cwd: testsRoot });

  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  const failureDetails: Array<{ title: string; error?: string; stack?: string }> = [];

  return new Promise<void>((resolve, reject) => {
    try {
      const runner = mocha.run((failures: number) => {
        if (failures > 0) {
          // VS Code's extension host does not reliably forward stdout from the test runner,
          // but stderr is captured in logs. Emit failure details to stderr for debugging.
          console.error(`Integration test failures (${failures}):`);
          failureDetails.forEach((failure, idx) => {
            console.error(`[${idx + 1}] ${failure.title}`);
            if (failure.error) {
              console.error(failure.error);
            }
            if (failure.stack) {
              console.error(failure.stack);
            }
          });
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });

      runner.on('fail', (test: any, err: any) => {
        const title = typeof test?.fullTitle === 'function' ? test.fullTitle() : String(test?.title ?? 'unknown');
        const record: { title: string; error?: string; stack?: string } = { title };
        if (err?.message) {
          record.error = String(err.message);
        }
        if (err?.stack) {
          record.stack = String(err.stack);
        }
        failureDetails.push(record);
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
