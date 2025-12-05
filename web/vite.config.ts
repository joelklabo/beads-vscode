import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePkg = (rel: string) => path.resolve(__dirname, rel);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@beads/core': resolvePkg('../packages/core/src'),
      '@beads/ui-headless': resolvePkg('../packages/ui-headless/src'),
      '@beads/ui-web': resolvePkg('../packages/ui-web/src'),
      fs: resolvePkg('./src/shims/fs.ts'),
      path: resolvePkg('./src/shims/path.ts'),
      'child_process': resolvePkg('./src/shims/child_process.ts'),
      util: resolvePkg('./src/shims/util.ts'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
