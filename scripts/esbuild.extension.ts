import fs from 'node:fs';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const minify = process.env.BUNDLE_MINIFY === '1';

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
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

async function run() {
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    const result = await build(options);
    // Persist metafile for audit script
    await fs.promises.mkdir('dist', { recursive: true });
    await fs.promises.writeFile('dist/extension.meta.json', JSON.stringify(result.metafile, null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
