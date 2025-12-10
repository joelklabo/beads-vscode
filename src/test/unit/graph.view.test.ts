import * as assert from 'assert';
import { DependencyTreeStrings, GraphEdgeData, GraphNodeData } from '../../utils/graph';
import { buildDependencyGraphHtml } from '../../graph/view';

type TypedNode = GraphNodeData & { issueType?: string };

describe('dependency graph html', () => {
  const strings: DependencyTreeStrings = {
    title: 'Dependencies',
    resetView: 'Reset',
    autoLayout: 'Auto layout',
    removeDependencyLabel: 'Remove dependency',
    legendClosed: 'Closed',
    legendInProgress: 'In Progress',
    legendOpen: 'Open',
    legendBlocked: 'Blocked',
    emptyTitle: 'No dependencies',
    emptyDescription: 'Add a dependency to see it here',
    renderErrorTitle: 'Failed to render graph',
  };

  it('includes legend entries and chip hooks for status/type styling', () => {
    const nodes: TypedNode[] = [
      { id: 'BD-1', title: 'Feature', status: 'in_progress', issueType: 'feature' },
      { id: 'BD-2', title: 'Bug', status: 'blocked', issueType: 'bug' },
    ];
    const edges: GraphEdgeData[] = [{ sourceId: 'BD-1', targetId: 'BD-2', type: 'blocks' }];

    const html = buildDependencyGraphHtml(nodes, edges, strings, 'en-US', false);

    assert.ok(html.includes('status-indicator closed'), 'legend shows closed status');
    assert.ok(html.includes('status-indicator in_progress'), 'legend shows in-progress status');
    assert.ok(html.includes('status-indicator blocked'), 'legend shows blocked status');
    assert.ok(html.includes('.bead-chip.status-in_progress.pulsing'), 'CSS includes pulse hook for in-progress chips');
    assert.ok(html.includes('.bead-chip.type-feature'), 'CSS includes type chip styling');
    assert.ok(html.includes('"issueType":"feature"'), 'node data keeps type for runtime rendering');
  });
});
