import type { TextProps } from 'ink';

export type InkColor = TextProps['color'];

export interface InkThemeTokens {
  accent: InkColor;
  muted: InkColor;
  success: InkColor;
  warning: InkColor;
  danger: InkColor;
  favorite: InkColor;
  status: {
    open: InkColor;
    in_progress: InkColor;
    blocked: InkColor;
    default: InkColor;
  };
  selection: {
    caret: string;
    caretColor?: InkColor;
  };
  graph: {
    node: InkColor;
    edge: InkColor;
  };
}

export const defaultInkTheme: InkThemeTokens = {
  accent: 'cyan',
  muted: 'gray',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  favorite: 'magenta',
  status: {
    open: 'green',
    in_progress: 'yellow',
    blocked: 'red',
    default: 'white',
  },
  selection: {
    caret: '>',
    caretColor: 'cyan',
  },
  graph: {
    node: 'white',
    edge: 'blue',
  },
};

export function resolveStatusColor(status: string | undefined, tokens: InkThemeTokens = defaultInkTheme): InkColor {
  if (!status) return tokens.status.default;
  const normalized = status.toLowerCase();
  if (normalized === 'open' || normalized === 'todo' || normalized === 'backlog') {
    return tokens.status.open;
  }
  if (normalized === 'in_progress' || normalized === 'in progress') {
    return tokens.status.in_progress;
  }
  if (normalized === 'blocked') {
    return tokens.status.blocked;
  }
  return tokens.status.default;
}
