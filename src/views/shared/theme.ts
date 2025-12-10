export type StatusId = 'open' | 'in_progress' | 'blocked' | 'closed';
export type PriorityId = 0 | 1 | 2 | 3;
export type IssueTypeId = 'epic' | 'feature' | 'bug' | 'task' | 'chore' | 'spike';
export type AssigneeToken = { label: string; color: string; background: string; icon: string };

export interface StatusToken {
  id: StatusId;
  label: string;
  color: string;
  background: string;
  icon: string;
  pulsing?: boolean;
}

export interface PriorityToken {
  id: PriorityId;
  label: string;
  color: string;
  background: string;
  icon: string;
}

export interface IssueTypeToken {
  id: IssueTypeId;
  label: string;
  color: string;
  icon: string;
}

export const STATUS_TOKENS: Record<StatusId, StatusToken> = {
  open: {
    id: 'open',
    label: 'Open',
    color: 'var(--vscode-charts-blue)',
    background: 'color-mix(in srgb, var(--vscode-charts-blue) 18%, transparent)',
    icon: 'circle-outline',
  },
  in_progress: {
    id: 'in_progress',
    label: 'In Progress',
    color: 'var(--vscode-charts-yellow)',
    background: 'color-mix(in srgb, var(--vscode-charts-yellow) 26%, transparent)',
    icon: 'play',
    pulsing: true,
  },
  blocked: {
    id: 'blocked',
    label: 'Blocked',
    color: 'var(--vscode-charts-red)',
    background: 'color-mix(in srgb, var(--vscode-charts-red) 20%, transparent)',
    icon: 'stop',
  },
  closed: {
    id: 'closed',
    label: 'Closed',
    color: 'var(--vscode-disabledForeground)',
    background: 'color-mix(in srgb, var(--vscode-foreground) 6%, transparent)',
    icon: 'pass',
  },
};

export const PRIORITY_TOKENS: Record<PriorityId, PriorityToken> = {
  0: {
    id: 0,
    label: 'P0',
    color: 'var(--vscode-charts-red)',
    background: 'color-mix(in srgb, var(--vscode-charts-red) 24%, transparent)',
    icon: 'flame',
  },
  1: {
    id: 1,
    label: 'P1',
    color: 'var(--vscode-charts-orange)',
    background: 'color-mix(in srgb, var(--vscode-charts-orange) 20%, transparent)',
    icon: 'arrow-up',
  },
  2: {
    id: 2,
    label: 'P2',
    color: 'var(--vscode-descriptionForeground)',
    background: 'color-mix(in srgb, var(--vscode-descriptionForeground) 16%, transparent)',
    icon: 'arrow-right',
  },
  3: {
    id: 3,
    label: 'P3',
    color: 'var(--vscode-disabledForeground)',
    background: 'color-mix(in srgb, var(--vscode-disabledForeground) 12%, transparent)',
    icon: 'arrow-down',
  },
};

export const ISSUE_TYPE_TOKENS: Record<IssueTypeId, IssueTypeToken> = {
  epic: {
    id: 'epic',
    label: 'Epic',
    color: 'var(--vscode-charts-purple)',
    icon: 'list-tree',
  },
  feature: {
    id: 'feature',
    label: 'Feature',
    color: 'var(--vscode-charts-green)',
    icon: 'sparkle',
  },
  bug: {
    id: 'bug',
    label: 'Bug',
    color: 'var(--vscode-charts-red)',
    icon: 'bug',
  },
  task: {
    id: 'task',
    label: 'Task',
    color: 'var(--vscode-charts-blue)',
    icon: 'checklist',
  },
  chore: {
    id: 'chore',
    label: 'Chore',
    color: 'var(--vscode-charts-yellow)',
    icon: 'wrench',
  },
  spike: {
    id: 'spike',
    label: 'Spike',
    color: 'var(--vscode-charts-blue)',
    icon: 'telescope',
  },
};

export const PULSE_ANIMATION_NAME = 'beadPulse';
const ASSIGNEE_DEFAULT: AssigneeToken = {
  label: 'Assignee',
  color: 'var(--vscode-charts-blue)',
  background: 'color-mix(in srgb, var(--vscode-charts-blue) 22%, transparent)',
  icon: 'account',
};

/**
 * Returns a base CSS string that can be injected into any Beady webview.
 * It defines chip styles, status/priority/type variants, and the in-progress pulse animation.
 */
export function buildSharedStyles(): string {
  return /* css */ `
:root {
  --bead-chip-radius: 999px;
  --bead-chip-font: var(--vscode-font-family);
  --bead-chip-font-size: 11px;
  --bead-chip-padding-y: 2px;
  --bead-chip-padding-x: 7px;
  --bead-assignee-color: ${ASSIGNEE_DEFAULT.color};
  --bead-assignee-bg: ${ASSIGNEE_DEFAULT.background};
  --bead-chip-gap: 5px;
}

body.compact {
  --bead-chip-font-size: 10px;
  --bead-chip-padding-y: 1px;
  --bead-chip-padding-x: 5px;
  --bead-chip-gap: 4px;
}

@keyframes ${PULSE_ANIMATION_NAME} {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--vscode-charts-yellow) 46%, transparent); }
  65% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--vscode-charts-yellow) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--vscode-charts-yellow) 0%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .bead-chip.status-in_progress.pulsing {
    animation: none;
  }
}

.bead-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bead-chip-gap, 6px);
  padding: var(--bead-chip-padding-y) var(--bead-chip-padding-x);
  border-radius: var(--bead-chip-radius);
  border: 1px solid transparent;
  font-family: var(--bead-chip-font);
  font-size: var(--bead-chip-font-size);
  line-height: 1.1;
  white-space: nowrap;
  user-select: none;
}

.bead-chip .codicon { font-size: 12px; }
.bead-chip.sm { padding: 1px 6px; font-size: 10px; gap: 4px; }

/* Status chips */
.bead-chip.status-open {
  color: ${STATUS_TOKENS.open.color};
  background: ${STATUS_TOKENS.open.background};
  border-color: color-mix(in srgb, ${STATUS_TOKENS.open.color} 40%, transparent);
}

.bead-chip.status-in_progress {
  color: ${STATUS_TOKENS.in_progress.color};
  background: ${STATUS_TOKENS.in_progress.background};
  border-color: color-mix(in srgb, ${STATUS_TOKENS.in_progress.color} 40%, transparent);
}

.bead-chip.status-in_progress.pulsing {
  animation: ${PULSE_ANIMATION_NAME} 1.6s ease-out infinite;
}

.bead-chip.status-blocked {
  color: ${STATUS_TOKENS.blocked.color};
  background: ${STATUS_TOKENS.blocked.background};
  border-color: color-mix(in srgb, ${STATUS_TOKENS.blocked.color} 40%, transparent);
}

.bead-chip.status-closed {
  color: ${STATUS_TOKENS.closed.color};
  background: ${STATUS_TOKENS.closed.background};
  border-color: color-mix(in srgb, ${STATUS_TOKENS.closed.color} 30%, transparent);
}

/* Priority chips */
${Object.values(PRIORITY_TOKENS).map((token) => {
  return `.bead-chip.priority-${token.id} {\n  color: ${token.color};\n  background: ${token.background};\n  border-color: color-mix(in srgb, ${token.color} 35%, transparent);\n}`;
}).join('\n')}

/* Type chips */
${Object.values(ISSUE_TYPE_TOKENS).map((token) => {
  return `.bead-chip.type-${token.id} {\n  color: ${token.color};\n  background: color-mix(in srgb, ${token.color} 18%, transparent);\n  border-color: color-mix(in srgb, ${token.color} 35%, transparent);\n}`;
}).join('\n')}

/* Assignee chip (color supplied per-item via --bead-assignee-color/bg) */
.bead-chip.assignee {
  color: var(--bead-assignee-color);
  background: var(--bead-assignee-bg);
  border-color: color-mix(in srgb, var(--bead-assignee-color) 38%, transparent);
}

`; // end css
}

export function getStatusToken(id: string | undefined): StatusToken {
  if (id && id in STATUS_TOKENS) {
    return STATUS_TOKENS[id as StatusId];
  }
  return STATUS_TOKENS.open;
}

export function getPriorityToken(id: number | undefined): PriorityToken {
  if (id !== undefined) {
    const key = Math.max(0, Math.min(3, Math.round(id))) as PriorityId;
    return PRIORITY_TOKENS[key];
  }
  return PRIORITY_TOKENS[2];
}

export function getIssueTypeToken(id: string | undefined): IssueTypeToken {
  if (id && id in ISSUE_TYPE_TOKENS) {
    return ISSUE_TYPE_TOKENS[id as IssueTypeId];
  }
  return ISSUE_TYPE_TOKENS.task;
}

export function getAssigneeToken(color?: string, background?: string): AssigneeToken {
  return {
    ...ASSIGNEE_DEFAULT,
    color: color ?? ASSIGNEE_DEFAULT.color,
    background: background ?? ASSIGNEE_DEFAULT.background,
  };
}
