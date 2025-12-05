import assert from 'node:assert';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { BeadList } from '../src/components/BeadList';
import { BeadDetail } from '../src/components/BeadDetail';
import { DependencyGraphView } from '../src/components/DependencyGraphView';
import { FavoritesBadge } from '../src/components/FavoritesBadge';

// Minimal DOM for React Testing Library
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window as any;
globalThis.document = dom.window.document as any;
globalThis.HTMLElement = dom.window.HTMLElement as any;
globalThis.Element = dom.window.Element as any;
globalThis.Node = dom.window.Node as any;
globalThis.navigator = dom.window.navigator as any;

const sampleItems = [
  { id: 'bd-1', title: 'First', status: 'open', tags: ['ui'], favorite: true },
  { id: 'bd-2', title: 'Second', status: 'blocked', tags: ['core'] },
];

test('renders bead list with selection and favorite toggle', () => {
  const selectedCalls: string[] = [];
  const favCalls: string[] = [];

  const { getByText, getAllByLabelText, getByRole } = render(
    <BeadList items={sampleItems} selectedId="bd-2" onSelect={(id) => selectedCalls.push(id)} onToggleFavorite={(id) => favCalls.push(id)} />
  );

  fireEvent.click(getByText('Second'));
  assert.deepStrictEqual(selectedCalls, ['bd-2']);

  fireEvent.click(getAllByLabelText(/favorite/i)[1]);
  assert.deepStrictEqual(favCalls, ['bd-2']);
  assert.ok(getByRole('list'));
});

test('shows bead detail with labels and dependencies', () => {
  const { getByLabelText } = render(
    <BeadDetail
      bead={{
        id: 'bd-1',
        title: 'First',
        description: 'Detail',
        status: 'open',
        labels: ['frontend'],
        dependencies: { upstream: ['bd-0'], downstream: ['bd-2'] },
      }}
    />
  );

  assert.ok(getByLabelText('status').textContent?.includes('open'));
  assert.ok(getByLabelText('labels'));
  assert.ok(getByLabelText('upstream').textContent?.includes('bd-0'));
  assert.ok(getByLabelText('downstream').textContent?.includes('bd-2'));
});

test('renders dependency graph nodes and edges', () => {
  const nodeCalls: string[] = [];
  const { getByLabelText } = render(
    <DependencyGraphView
      nodes={[{ id: 'bd-1' }, { id: 'bd-2', title: 'Two' }]}
      edges={[{ sourceId: 'bd-1', targetId: 'bd-2', type: 'blocks' }]}
      onSelectNode={(id) => nodeCalls.push(id)}
    />
  );

  fireEvent.click(getByLabelText('node-bd-1'));
  assert.deepStrictEqual(nodeCalls, ['bd-1']);
  assert.ok(getByLabelText('graph-edges').textContent?.includes('bd-1'));
});

test('shows favorites badge count', () => {
  const { getByLabelText } = render(<FavoritesBadge count={3} />);
  assert.ok(getByLabelText('favorites-count-3').textContent?.includes('3'));
});
