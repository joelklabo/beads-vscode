import * as assert from 'assert';
import Module = require('module');
import { createContextStub, createVscodeStub } from '../utils/webview';
import { BeadItemData } from '../../utils';

suite('Expandable rows', () => {
  let restoreLoad: any;
  let vscodeStub: any;
  let BeadsTreeDataProvider: any;
  let BeadTreeItem: any;

  setup(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    ['../../extension', '../../providers/beads/items', '../../utils'].forEach((id) => {
      try {
        delete require.cache[require.resolve(id)];
      } catch {
        // ignore cache misses
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const items = require('../../providers/beads/items');
    BeadTreeItem = items.BeadTreeItem;
  });

  teardown(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  test('expansion persists and renders detail rows', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);

    (provider as any).items = [
      {
        id: 'task-1',
        title: 'Inspect row',
        status: 'open',
        assignee: 'Casey',
        tags: ['frontend', 'a11y'],
        updatedAt: new Date().toISOString(),
      } as BeadItemData,
    ];

    let roots = await provider.getChildren();
    assert.strictEqual(roots.length, 1);
    const bead = roots[0] as any;
    assert.ok(bead instanceof BeadTreeItem);
    assert.strictEqual(bead.collapsibleState, vscodeStub.TreeItemCollapsibleState.Collapsed);

    // Simulate user expanding via keyboard/mouse
    provider.handleCollapseChange(bead, false);
    const stored = context.workspaceState.get('beads.expandedRows');
    assert.deepStrictEqual(stored, ['task-1']);

    roots = await provider.getChildren();
    const expanded = roots[0] as any;
    assert.strictEqual(expanded.collapsibleState, vscodeStub.TreeItemCollapsibleState.Expanded);

    const detailItems = await provider.getChildren(expanded);
    assert.ok(detailItems.length > 0, 'expanded rows should expose detail items');
    const detailLabels = detailItems.map((d: any) => d.label as string);
    assert.ok(detailLabels.some((label: string) => /Labels/i.test(label)));
    assert.ok(detailLabels.some((label: string) => /Updated/i.test(label)));

    // Collapse and ensure state is cleared
    provider.handleCollapseChange(expanded, true);
    const cleared = context.workspaceState.get('beads.expandedRows');
    assert.deepStrictEqual(cleared, []);
  });
});
