import fs from 'node:fs';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const minify = process.env.BUNDLE_MINIFY === '1';

const extensionOptions = {
  entryPoints: {
    'extension': 'src/extension.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  sourcemap: true,
  minify,
  external: ['vscode', '@vscode/test-electron'],
  tsconfig: 'tsconfig.base.json',
  metafile: true,
  logLevel: 'info' as const,
};

const webviewOptions = {
  entryPoints: {
    'views/issues': 'src/views/issues/index.tsx'
  },
  outdir: 'dist',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome108'], // VS Code 1.85+ uses Chrome 108+
  sourcemap: true,
  minify,
  external: ['vscode'], // vscode API is global
  tsconfig: 'tsconfig.base.json',
  metafile: true,
  logLevel: 'info' as const,
};

async function run() {
  if (watch) {
    const ctxExt = await context(extensionOptions);
    const ctxView = await context(webviewOptions);
    await Promise.all([ctxExt.watch(), ctxView.watch()]);
    console.log('[esbuild] Watching for changes...');
  } else {
    const [resExt, resView] = await Promise.all([
      build(extensionOptions),
      build(webviewOptions)
    ]);
    // Persist metafile for audit script (merging them roughly or just keeping extension)
    await fs.promises.mkdir('dist', { recursive: true });
    await fs.promises.writeFile('dist/extension.meta.json', JSON.stringify(resExt.metafile, null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
