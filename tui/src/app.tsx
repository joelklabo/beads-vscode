// Minimal Ink status bar for TUI that surfaces worktree badge.
// Note: tui directory is excluded from the main tsconfig compile; this file
// serves as a reference implementation for future Ink wiring.

import React from 'react';
import type { TextProps } from 'ink';
import { worktreeLabel } from './lib/worktree';

type StatusBarProps = {
  cwd: string;
  message?: string;
  textComponent?: React.ComponentType<TextProps>;
};

export const StatusBar: React.FC<StatusBarProps> = ({ cwd, message, textComponent }) => {
  const Text = textComponent ?? ((props: TextProps) => React.createElement('text', props));
  const label = worktreeLabel(cwd);
  const parts = [label];
  if (message) parts.push(message);

  return React.createElement(Text, { color: 'cyan' }, parts.join(' · '));
};

export default StatusBar;
