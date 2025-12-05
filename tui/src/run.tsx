import React from 'react';
import { render } from 'ink';
import App from './app';

const rawSupported = Boolean(process.stdin && (process.stdin as any).isTTY && typeof (process.stdin as any).setRawMode === 'function');

if (!rawSupported) {
  // Provide a clear message when running in a non-TTY environment (e.g., CI or piping).
  // This avoids the Ink raw-mode error and guides the user to run in a real terminal.
  // eslint-disable-next-line no-console
  console.error('Ink TUI needs a TTY. Run in a terminal (or tmux/screen) without piping output.');
  process.exit(1);
}

render(<App />);
