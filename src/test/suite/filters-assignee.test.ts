import * as assert from 'assert';
import Module = require('module');
import { createContextStub, createVscodeStub } from '../utils/webview';
import { BeadItemData } from '../../utils';

suite('Filter & assignee flows', () => {
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
    BeadTreeItem = require('../../providers/beads/items').BeadTreeItem;
  });

  teardown(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  test('quick filter selection updates context and tree description', async () => {
    const pick = {
      label: 'In Progress',
      description: '',
      detail: '',
      key: 'status:in_progress',
      preset: { kind: 'status', value: 'in_progress' },
      picked: false,
    } as any;
    vscodeStub._nextQuickPick = pick;

    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    provider.setTreeView({ description: undefined } as any);

    (provider as any).items = [
      { id: 'open-1', title: 'Open issue', status: 'open' } as BeadItemData,
      { id: 'ip-1', title: 'Working', status: 'in_progress' } as BeadItemData,
    ];

    await provider.applyQuickFilterPreset();

    const active = provider.getQuickFilter();
    assert.ok(active && active.kind === 'status' && active.value === 'in_progress');

    const visibleIds = provider.getVisibleBeads().map((b: BeadItemData) => b.id);
    assert.deepStrictEqual(visibleIds, ['ip-1']);

    const contexts = vscodeStub.commands._calls
      .filter((c: any) => c.command === 'setContext')
      .reduce((acc: any, c: any) => {
        acc[c.args[0]] = c.args[1];
        return acc;
      }, {} as Record<string, any>);

    assert.strictEqual(contexts['beads.activeQuickFilter'], 'status:in_progress');
    assert.strictEqual(contexts['beads.quickFilterActive'], true);
    assert.ok((provider as any).treeView.description?.includes('In Progress'));
  });

  test('assignee sort keeps unassigned last and shows badges', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).sortMode = 'assignee';

    (provider as any).items = [
      { id: 'task-a', title: 'Alpha', status: 'blocked', assignee: 'Alice' },
      { id: 'task-b', title: 'Beta', status: 'open', assignee: 'Bob' },
      { id: 'task-c', title: 'Gamma', status: 'in_progress', assignee: '' },
    ] as BeadItemData[];

    const roots = await provider.getChildren();
    const beadNodes = roots.filter((node: any) => node instanceof BeadTreeItem);
    const ids = beadNodes.map((n: any) => n.bead.id);
    assert.deepStrictEqual(ids, ['task-a', 'task-b', 'task-c']);

    beadNodes.forEach((node: any) => {
      const desc = node.description || '';
      assert.ok(/open|blocked|in progress/i.test(desc), 'description should contain status');
      assert.ok(desc.includes('·'), 'description should show badge separators');
    });
  });
});
