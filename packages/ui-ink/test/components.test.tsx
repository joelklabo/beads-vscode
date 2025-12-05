import assert from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { render } from 'ink-testing-library';
import type { BeadsViewModel, BeadDetailModel, GraphViewModel } from '@beads/ui-headless';
import type { BeadItemData } from '@beads/core';
import Core from '@beads/core';
import { BeadList } from '../src/components/BeadList';
import { BeadDetail } from '../src/components/BeadDetail';
import { GraphList } from '../src/components/GraphList';
import { StatusBar } from '../src/components/StatusBar';

const sampleItems: BeadItemData[] = [
  { id: 'bd-1', title: 'First', status: 'open', raw: {} },
  { id: 'bd-2', title: 'Second', status: 'in_progress', raw: {}, tags: ['favorite'] },
];

const makeStore = (items: BeadItemData[]): Core.BeadsStore =>
  new Core.BeadsStore({ loader: async () => ({ items, document: { filePath: '', root: items, beads: items } }) });

const makeView = (items: BeadItemData[]): BeadsViewModel => {
  const store = makeStore(items);
  return {
    items,
    stale: [],
    loading: false,
    snapshot: { items, workspaces: [] },
    refresh: async () => ({ items, workspaces: [] }),
    store,
  };
};

const sleep = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('BeadList renders items and handles arrow/enter keys', async () => {
  const view = makeView(sampleItems);
  let activated: string | undefined;
  const { lastFrame, stdin } = render(
    <BeadList
      view={view}
      autoFocus
      favoriteIds={new Set(['bd-2'])}
      onActivate={(item) => {
        activated = item.id;
      }}
    />
  );

  assert.ok(lastFrame().includes('bd-1'));
  await sleep();
  stdin.write('j');
  await sleep();
  assert.ok(lastFrame().includes('bd-2'));
  stdin.write('\r');
  await sleep();
  assert.strictEqual(activated, 'bd-2');
});

test('BeadList shows empty and error states without crashing', () => {
  const emptyView = makeView([]);
  const { lastFrame } = render(<BeadList view={emptyView} errorMessage="bd CLI missing" />);
  assert.ok(lastFrame().includes('bd CLI missing'));
  assert.ok(lastFrame().includes('No beads found'));
});

test('BeadDetail prints dependencies', () => {
  const bead = { id: 'bd-1', title: 'Root', status: 'open', raw: {} };
  const upstream = [{ sourceId: 'bd-2', targetId: 'bd-1', type: 'blocks', sourceTitle: 'Parent' }];
  const model: BeadDetailModel = {
    bead,
    upstream,
    downstream: [],
    snapshot: { items: [bead, { id: 'bd-2', title: 'Parent', status: 'blocked', raw: {} }], workspaces: [] },
    refresh: async () => ({ items: [], workspaces: [] }),
    store: makeStore([bead]),
  };

  const { lastFrame } = render(<BeadDetail model={model} />);
  assert.ok(lastFrame().includes('Upstream'));
  assert.ok(lastFrame().includes('bd-2'));
  assert.ok(lastFrame().includes('blocked'));
});

test('GraphList lists edges and summary counts', () => {
  const graph: GraphViewModel = {
    nodes: [
      { id: 'bd-1', title: 'One', status: 'open' },
      { id: 'bd-2', title: 'Two', status: 'open' },
    ],
    edges: [{ sourceId: 'bd-1', targetId: 'bd-2', type: 'blocks' }],
    snapshot: { items: [], workspaces: [] },
    refresh: async () => ({ items: [], workspaces: [] }),
    store: makeStore([]),
  };

  const { lastFrame } = render(<GraphList graph={graph} />);
  assert.ok(lastFrame().includes('Nodes: 2'));
  assert.ok(lastFrame().includes('Edges: 1'));
  assert.ok(lastFrame().includes('bd-1')); // shows edge line
});

test('StatusBar shows counts and stale info', () => {
  const view = makeView(sampleItems);
  view.stale = [sampleItems[1]];
  const { lastFrame } = render(<StatusBar view={view} favoriteIds={new Set(['bd-1'])} message="ready" />);
  const frame = lastFrame();
  assert.ok(frame.includes('Total 2'));
  assert.ok(frame.includes('In progress 1'));
  assert.ok(frame.includes('Stale 1'));
  assert.ok(frame.includes('Favorites 1'));
  assert.ok(frame.includes('ready'));
});
