import assert from 'assert';
import React from 'react';
import Core from '@beads/core';
import App from '../app';

const { BeadsStore } = Core as typeof import('@beads/core');
const mockStore = new BeadsStore({
  loader: async () => ({ items: [], document: { filePath: 'mock', root: [], beads: [], watchPaths: [] } }),
});

async function run(): Promise<void> {
  const { render } = await import('ink-testing-library');

  // Test: chord g a
  let lastTab: string | undefined;
  let ink = render(
    <App initialTab="dashboard" cwd="/tmp" store={mockStore} onTabChange={(tab) => (lastTab = tab)} simulateKeys={["g", "a"]} />
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(lastTab, 'activity');
  ink.unmount();

  // Test: arrows navigate
  lastTab = undefined;
  ink = render(
    <App initialTab="dashboard" cwd="/tmp" store={mockStore} onTabChange={(tab) => (lastTab = tab)} simulateKeys={["RIGHT", "RIGHT"]} />
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(lastTab, 'activity');
  ink.unmount();

  // Test: theme toggle
  let theme: string | undefined;
  ink = render(<App initialTab="dashboard" cwd="/tmp" store={mockStore} onThemeChange={(t) => (theme = t)} simulateKeys={["t"]} />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(theme === 'light' || theme === 'dark' || theme === 'auto');
  ink.unmount();

  console.log('✅ tui nav runner passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
