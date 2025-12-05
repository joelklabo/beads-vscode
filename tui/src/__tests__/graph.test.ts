import assert from 'assert';
import { detectCycles, filterGraph, layoutGraph } from '../lib/graph';

const nodes = [
  { id: 'A', title: 'Root' },
  { id: 'B' },
  { id: 'C' },
];

const edges = [
  { sourceId: 'A', targetId: 'B' },
  { sourceId: 'B', targetId: 'C' },
];

function run(): void {
  const cycles = detectCycles([...edges, { sourceId: 'C', targetId: 'A' }]);
  assert.ok(cycles.hasCycle);
  assert.ok(cycles.cycles[0].includes('A'));

  const filtered = filterGraph(nodes, edges, { query: 'B' });
  assert.strictEqual(filtered.nodes.length, 1);
  assert.strictEqual(filtered.edges.length, 0);

  const lines = layoutGraph(nodes, edges, 20);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((l) => l.length <= 20));

  console.log('✅ graph tests passed');
}

run();
