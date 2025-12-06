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
  logLevel: 'info' as const,
};

async function run() {
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await build(options);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
