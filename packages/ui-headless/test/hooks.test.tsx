import assert from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { BeadsStore, WorkspaceTarget, BeadItemData } from '@beads/core';
import { useBeadsView, useGraphData } from '../src/hooks/beads';

const bead = (overrides: Partial<BeadItemData> = {}): BeadItemData => ({
  id: overrides.id ?? 'bd-1',
  title: overrides.title ?? 'First',
  status: overrides.status ?? 'open',
  raw: overrides.raw ?? {},
  tags: overrides.tags ?? [],
  inProgressSince: overrides.inProgressSince,
});

function renderWithStore(component: React.ReactElement) {
  let renderer: any;
  act(() => {
    renderer = create(component);
  });
  return renderer;
}

const workspaces: WorkspaceTarget[] = [{ id: 'ws-1', root: '/tmp/ws-1' }];

test('useBeadsView returns filtered items and stale subset', async () => {
  const items = [bead({ id: 'bd-1', inProgressSince: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), status: 'in_progress' })];
  const store = new BeadsStore({ loader: async () => ({ items, document: { filePath: '/tmp/.beads', root: items, beads: items } }) });

  let view: any;
  function Test() {
    view = useBeadsView({ workspaces, store, query: 'bd-1' });
    return null;
  }

  await act(async () => {
    renderWithStore(<Test />);
    await store.refresh(workspaces);
  });

  assert.ok(view.items.length === 1, 'filtered items should be returned');
  assert.ok(view.stale.length === 1, 'stale list should include in-progress item');
  assert.strictEqual(view.loading, false);
});

test('useGraphData maps nodes and edges', async () => {
  const items = [bead({ id: 'bd-1', raw: { dependencies: [{ depends_on_id: 'bd-2', dep_type: 'blocks' }] } }), bead({ id: 'bd-2' })];
  const store = new BeadsStore({ loader: async () => ({ items, document: { filePath: '/tmp/.beads', root: items, beads: items } }) });

  let graph: any;
  function Test() {
    graph = useGraphData(workspaces, store);
    return null;
  }

  await act(async () => {
    renderWithStore(<Test />);
    await store.refresh(workspaces);
  });

  assert.strictEqual(graph.nodes.length, 2);
  assert.strictEqual(graph.edges.length, 1);
  assert.strictEqual(graph.edges[0].sourceId, 'bd-1');
  assert.strictEqual(graph.edges[0].targetId, 'bd-2');
});
