import React from 'react';
import type { RenderOptions } from 'ink';
import { render } from 'ink';
import App, { type AppProps } from './app';

export interface StartOptions {
  stdin?: NodeJS.ReadStream;
  renderFn?: (node: React.ReactElement, options?: RenderOptions) => unknown;
  /**
   * When false, skips the TTY guard so harnesses can inject fake/stdin streams.
   * Defaults to true to preserve CLI safety.
   */
  requireTTY?: boolean;
  /**
   * Optional props forwarded to the root Ink App (used by test harness).
   */
  appProps?: Partial<AppProps>;
}

/**
 * Start the Ink TUI. Returns 0 on success, 1 when a TTY is not available.
 * A TTY with setRawMode is required for Ink to handle keyboard input.
 */
export function startApp(options: StartOptions = {}): number {
  const stdin = options.stdin ?? process.stdin;
  const renderFn = options.renderFn ?? render;
  const requireTTY = options.requireTTY ?? true;
  const rawSupported = Boolean(stdin && (stdin as any).isTTY && typeof (stdin as any).setRawMode === 'function');

  if (requireTTY && !rawSupported) {
    // eslint-disable-next-line no-console
    console.error('Ink TUI needs a TTY. Run in a terminal (or tmux/screen) without piping output.');
    return 1;
  }

  renderFn(<App {...(options.appProps ?? {})} />);
  return 0;
}
