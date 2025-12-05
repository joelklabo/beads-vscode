import assert from 'assert';
import React from 'react';
import { startApp } from '../start';

const fakeRender = (): void => {
  /* noop render stub for tests */
};

const makeStdin = (opts: Partial<NodeJS.ReadStream>): NodeJS.ReadStream =>
  ({
    isTTY: opts.isTTY,
    setRawMode: opts.setRawMode,
  } as unknown as NodeJS.ReadStream);

function run(): void {
  // Non-TTY should return 1 and emit error
  let errorMessage: string | undefined;
  const originalError = console.error;
  console.error = (msg?: string): void => {
    errorMessage = typeof msg === 'string' ? msg : String(msg);
  };
  const codeNoTty = startApp({ stdin: makeStdin({ isTTY: false }) });
  console.error = originalError;
  assert.strictEqual(codeNoTty, 1, 'Non-TTY should return exit code 1');
  assert.ok(errorMessage?.includes('needs a TTY'), 'Should log TTY guidance');

  // TTY with setRawMode should succeed and use injected renderer
  let rendered = false;
  const codeTty = startApp({
    stdin: makeStdin({ isTTY: true, setRawMode: () => undefined }),
    renderFn: ((node: React.ReactElement) => {
      rendered = true;
      return node;
    }) as any,
  });
  assert.strictEqual(codeTty, 0, 'TTY should return 0');
  assert.ok(rendered, 'Render function should be invoked');

  console.log('✅ startApp tests passed');
}

run();
