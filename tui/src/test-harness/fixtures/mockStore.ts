import { BeadItemData, BeadsDocument, BeadsStore, WorkspaceTarget } from '@beads/core';

const MOCK_WORKSPACE: WorkspaceTarget = {
  id: 'mock-ws',
  root: '/tmp/beads-mock',
};

const MOCK_ITEMS: BeadItemData[] = [
  {
    id: 'TUI-101',
    title: 'Deterministic fixtures for TUI harness',
    status: 'open',
    issueType: 'feature',
    description: 'Baseline dataset that avoids network/FS side effects.',
    assignee: 'Ada Lovelace',
    tags: ['platform', 'tui'],
    updatedAt: '2025-01-02T10:00:00Z',
    raw: {
      id: 'TUI-101',
      title: 'Deterministic fixtures for TUI harness',
      status: 'open',
      assignee: 'Ada Lovelace',
      labels: ['platform', 'tui'],
      description: 'Baseline dataset that avoids network/FS side effects.',
      dependencies: [],
    },
  },
  {
    id: 'TUI-102',
    title: 'Render dense lists on narrow terminals',
    status: 'in_progress',
    issueType: 'task',
    description: 'Exercise wrapping and truncation with long descriptions that extend beyond eighty columns.',
    assignee: 'Grace Hopper',
    tags: ['frontend', 'density'],
    updatedAt: '2025-01-05T15:00:00Z',
    inProgressSince: '2025-01-05T14:00:00Z',
    raw: {
      id: 'TUI-102',
      status: 'in_progress',
      assignee: 'Grace Hopper',
      description: 'Exercise wrapping and truncation with long descriptions that extend beyond eighty columns.',
      labels: ['frontend', 'density'],
      dependencies: [{ id: 'TUI-101', dep_type: 'blocks' }],
    },
  },
  {
    id: 'TUI-103',
    title: 'Unicode σ alignment in lists',
    status: 'blocked',
    issueType: 'bug',
    description: 'Verify full-width glyphs like 世界 and symbols σ render without shifting columns.',
    assignee: 'Lin σ 世界',
    tags: ['i18n'],
    updatedAt: '2025-01-04T09:30:00Z',
    raw: {
      id: 'TUI-103',
      status: 'blocked',
      assignee: 'Lin σ 世界',
      description: 'Verify full-width glyphs like 世界 and symbols σ render without shifting columns.',
      labels: ['i18n'],
      dependencies: [
        { id: 'TUI-101', dep_type: 'related' },
        { id: 'TUI-104', dep_type: 'blocks' },
        { id: 'TUI-108', dep_type: 'related' },
      ],
    },
  },
  {
    id: 'TUI-104',
    title: 'Refactor dependency graph layout',
    status: 'closed',
    issueType: 'feature',
    description: 'Produce compact graph output that fits within 80 columns.',
    assignee: 'Raj Patel',
    tags: ['graph'],
    updatedAt: '2024-12-31T12:00:00Z',
    raw: {
      id: 'TUI-104',
      status: 'closed',
      assignee: 'Raj Patel',
      description: 'Produce compact graph output that fits within 80 columns.',
      labels: ['graph'],
      dependencies: [],
    },
  },
  {
    id: 'TUI-105',
    title: 'Keyboard cheat sheet overlay',
    status: 'in_progress',
    issueType: 'task',
    description: 'Show quick keymap hints inside status bar.',
    assignee: 'Sandy Metz',
    tags: ['ux'],
    updatedAt: '2025-01-03T20:00:00Z',
    inProgressSince: '2025-01-03T18:30:00Z',
    raw: {
      id: 'TUI-105',
      status: 'in_progress',
      assignee: 'Sandy Metz',
      description: 'Show quick keymap hints inside status bar.',
      labels: ['ux'],
      dependencies: [{ id: 'TUI-103', dep_type: 'related' }],
    },
  },
  {
    id: 'TUI-106',
    title: 'Dashboard sparkline spacing',
    status: 'open',
    issueType: 'task',
    description: 'Ensure sparklines align with labels in dashboard cards.',
    assignee: 'María Silva',
    tags: ['dashboard'],
    updatedAt: '2025-01-06T11:45:00Z',
    raw: {
      id: 'TUI-106',
      status: 'open',
      assignee: 'María Silva',
      description: 'Ensure sparklines align with labels in dashboard cards.',
      labels: ['dashboard'],
      dependencies: [],
    },
  },
  {
    id: 'TUI-107',
    title: 'Very long title that intentionally exceeds the typical wrap width to stress layout handling',
    status: 'open',
    issueType: 'chore',
    description: 'Keep this verbose to exercise truncation paths in list rows when columns shrink.',
    assignee: 'Quinn Longtext',
    tags: ['wrapping', 'longform'],
    updatedAt: '2025-01-06T07:00:00Z',
    raw: {
      id: 'TUI-107',
      status: 'open',
      assignee: 'Quinn Longtext',
      description: 'Keep this verbose to exercise truncation paths in list rows when columns shrink.',
      labels: ['wrapping', 'longform'],
      dependencies: [{ id: 'TUI-102', dep_type: 'related' }],
    },
  },
  {
    id: 'TUI-108',
    title: 'Graph missing-node detection',
    status: 'blocked',
    issueType: 'bug',
    description: 'Show placeholder when dependency id is not present in dataset.',
    assignee: 'Taylor Edge',
    tags: ['graph', 'error'],
    updatedAt: '2025-01-06T08:00:00Z',
    raw: {
      id: 'TUI-108',
      status: 'blocked',
      assignee: 'Taylor Edge',
      description: 'Show placeholder when dependency id is not present in dataset.',
      labels: ['graph', 'error'],
      dependencies: [{ id: 'TUI-999', dep_type: 'blocks' }, { id: 'TUI-104', dep_type: 'parent-child' }],
    },
  },
  {
    id: 'TUI-109',
    title: 'Activity feed density pass',
    status: 'open',
    issueType: 'task',
    description: 'Ensure activity entries trim descriptions and keep IDs visible.',
    assignee: 'Priya Patel',
    tags: ['activity'],
    updatedAt: '2025-01-02T08:30:00Z',
    raw: {
      id: 'TUI-109',
      status: 'open',
      assignee: 'Priya Patel',
      description: 'Ensure activity entries trim descriptions and keep IDs visible.',
      labels: ['activity'],
      dependencies: [],
    },
  },
  {
    id: 'TUI-110',
    title: 'Settings toggles discoverability',
    status: 'open',
    issueType: 'task',
    description: 'Present feature flags with concise summaries.',
    assignee: 'Alex Morgan',
    tags: ['settings'],
    updatedAt: '2025-01-03T10:15:00Z',
    raw: {
      id: 'TUI-110',
      status: 'open',
      assignee: 'Alex Morgan',
      description: 'Present feature flags with concise summaries.',
      labels: ['settings'],
      dependencies: [],
    },
  },
];

/**
 * Build a BeadsStore that returns deterministic mock data without hitting the CLI or filesystem.
 */
export function createMockStore(): { store: BeadsStore; workspaces: WorkspaceTarget[]; items: BeadItemData[] } {
  const workspaces = [MOCK_WORKSPACE];
  const items = MOCK_ITEMS.map((item, index) => ({ ...item, order: index }));

  const loader = async (): Promise<{ items: BeadItemData[]; document: BeadsDocument }> => {
    const cloned = items.map((item) => ({ ...item, raw: { ...item.raw } }));
    const document: BeadsDocument = {
      filePath: 'mock://beads.jsonl',
      root: cloned,
      beads: cloned,
      watchPaths: [],
    } as BeadsDocument;
    return { items: cloned, document };
  };

  const store = new BeadsStore({ loader, watchManager: undefined, watchAdapter: undefined });
  return { store, workspaces, items };
}

export function getMockItems(): BeadItemData[] {
  return MOCK_ITEMS.map((item) => ({ ...item, raw: { ...item.raw } }));
}
