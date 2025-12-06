import type { BeadItemData, BeadsDocument, WorkspaceTarget } from '@beads/core';
import { BeadsStore } from '@beads/core';
import type { AppProps } from '../app';

export interface KeyStep {
  key: string;
  delayMs?: number;
  note?: string;
}

export interface HarnessAppConfig extends Partial<AppProps> {
  store: BeadsStore;
  workspaces: WorkspaceTarget[];
}

export const HARNESS_DEFAULT_CLOCK = 1_700_000_000_000;

const fixtureWorkspaces: WorkspaceTarget[] = [{ id: 'fixture', root: process.cwd() }];

export const defaultKeyScenarios: Record<string, KeyStep[]> = {
  'nav-basic': [
    { key: 'g', note: 'goto chord' },
    { key: 'd', delayMs: 120, note: 'dashboard' },
    { key: 'g' },
    { key: 'i', delayMs: 120, note: 'issues' },
    { key: 'g' },
    { key: 'a', delayMs: 120, note: 'activity' },
    { key: 'g' },
    { key: 'g', delayMs: 120, note: 'graph' },
    { key: 'g' },
    { key: 's', delayMs: 120, note: 'settings' },
    { key: 'CTRL_C', delayMs: 60, note: 'exit' },
  ],
};

export function buildFixtureItems(clockMs: number = HARNESS_DEFAULT_CLOCK): BeadItemData[] {
  const nowIso = new Date(clockMs).toISOString();
  return [
    {
      id: 'beads-101',
      title: 'Navigation baseline',
      description: 'Cycle through tabs using g d/i/a/g/s',
      status: 'in_progress',
      assignee: 'fixture',
      updatedAt: nowIso,
      inProgressSince: nowIso,
      tags: ['fixture', 'demo'],
    },
    {
      id: 'beads-202',
      title: 'Graph layout sample',
      description: 'Shows dependency graph rendering',
      status: 'open',
      tags: ['graph'],
    },
    {
      id: 'beads-303',
      title: 'Settings toggle',
      description: 'Theme + help hints',
      status: 'open',
      tags: ['settings'],
    },
  ];
}

export function createHarnessAppConfig(options: { clockMs?: number; items?: BeadItemData[] } = {}): HarnessAppConfig {
  const clock = () => options.clockMs ?? HARNESS_DEFAULT_CLOCK;
  const items = options.items ?? buildFixtureItems(clock());
  const workspaces = fixtureWorkspaces;
  const document: BeadsDocument = {
    filePath: `${fixtureWorkspaces[0].root}/.beads/fixture.jsonl`,
    root: items,
    beads: items,
    watchPaths: [],
  };
  const store = new BeadsStore({
    loader: async () => ({ items, document }),
    clock,
    onError: (err) => console.error('[harness] store error', err),
  });

  return {
    store,
    workspaces,
    initialTab: 'dashboard',
  };
}

export function toPtySequence(key: string): string {
  const normalized = key.toUpperCase();
  switch (normalized) {
    case 'LEFT':
      return '\u001b[D';
    case 'RIGHT':
      return '\u001b[C';
    case 'UP':
      return '\u001b[A';
    case 'DOWN':
      return '\u001b[B';
    case 'ENTER':
    case 'RETURN':
      return '\r';
    case 'CTRL_C':
      return '\u0003';
    default:
      return key.length === 1 ? key : key;
  }
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export existing harness utilities for convenience
export * from './terminalRenderer';
export * from './pngSnapshot';
export * from './report';
