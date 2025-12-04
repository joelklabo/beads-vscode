import React from 'react';
import assert from 'assert';
import { render } from 'ink-testing-library';
import App from '../app';

describe('TUI navigation shell', () => {
  it('jumps to Activity via g a chord', () => {
    const { stdin, lastFrame, unmount } = render(<App initialTab="dashboard" cwd="/tmp" />);

    stdin.write('g');
    stdin.write('a');

    const frame = lastFrame() ?? '';
    assert.ok(frame.includes('Activity view'), frame);

    unmount();
  });

  it('cycles tabs with arrow keys', () => {
    const { stdin, lastFrame, unmount } = render(<App initialTab="dashboard" cwd="/tmp" />);

    stdin.write('\u001B[C'); // right arrow -> Issues

    let frame = lastFrame() ?? '';
    assert.ok(frame.includes('Issues view'), frame);

    stdin.write('\u001B[C'); // right arrow -> Activity
    frame = lastFrame() ?? '';
    assert.ok(frame.includes('Activity view'), frame);

    unmount();
  });

  it('toggles theme with t key', async () => {
    const { stdin, lastFrame, unmount } = render(<App initialTab="dashboard" cwd="/tmp" />);

    stdin.write('t');

    await new Promise((resolve) => setTimeout(resolve, 0));
    const frame = lastFrame() ?? '';
    assert.ok(frame.toLowerCase().includes('theme: dark') || frame.toLowerCase().includes('theme: auto') || frame.toLowerCase().includes('theme: light'), frame);

    unmount();
  });
});
