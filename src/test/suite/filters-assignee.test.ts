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

    assert.strictEqual(contexts['beady.activeQuickFilter'], 'status:in_progress');
    assert.strictEqual(contexts['beady.quickFilterActive'], true);
    assert.ok((provider as any).treeView.description?.includes('In Progress'));
  });

  test('assignee sort groups into sections with unassigned last', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).sortMode = 'assignee';

    (provider as any).items = [
      { id: 'task-a', title: 'Alpha', status: 'blocked', assignee: 'Alice' },
      { id: 'task-b', title: 'Beta', status: 'open', assignee: 'Bob' },
      { id: 'task-c', title: 'Gamma', status: 'in_progress', assignee: '' },
    ] as BeadItemData[];

    const roots = await provider.getChildren();
    const sections = roots.filter((node: any) => node.contextValue === 'assigneeSection');
    const labels = sections.map((s: any) => s.assignee);
    assert.deepStrictEqual(labels, ['Alice', 'Bob', 'Unassigned']);
    sections.forEach((section: any) => {
      assert.ok(typeof section.dot === 'string' && section.dot.length > 0);
    });

    const aliceChildren = await provider.getChildren(sections[0]);
    assert.deepStrictEqual(aliceChildren.map((n: any) => n.bead.id), ['task-a']);

    const bobChildren = await provider.getChildren(sections[1]);
    assert.deepStrictEqual(bobChildren.map((n: any) => n.bead.id), ['task-b']);

    const unassignedChildren = await provider.getChildren(sections[2]);
    assert.deepStrictEqual(unassignedChildren.map((n: any) => n.bead.id), ['task-c']);
  });

  test('assignee collapse state persists per bucket', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).sortMode = 'assignee';

    (provider as any).items = [
      { id: 'task-a', title: 'Alpha', status: 'open', assignee: 'Ada' },
      { id: 'task-b', title: 'Beta', status: 'open', assignee: 'Ada' },
      { id: 'task-c', title: 'Gamma', status: 'open', assignee: '' },
    ] as BeadItemData[];

    const roots = await provider.getChildren();
    const sections = roots.filter((n: any) => n.contextValue === 'assigneeSection');

    await provider.handleCollapseChange(sections[0], true);

    const provider2 = new BeadsTreeDataProvider(context as any);
    (provider2 as any).sortMode = 'assignee';
    (provider2 as any).items = (provider as any).items;
    const roots2 = await provider2.getChildren();
    const adaSection = roots2.find((n: any) => n.contextValue === 'assigneeSection' && n.assignee === 'Ada');
    assert.strictEqual(adaSection.collapsibleState, createVscodeStub().TreeItemCollapsibleState.Collapsed);
  });

  test('closed toggle hides items in assignee view and persists', async () => {
    const context = createContextStub();
    const provider = new BeadsTreeDataProvider(context as any);
    (provider as any).sortMode = 'assignee';

    const items: BeadItemData[] = [
      { id: 'task-open', title: 'Open item', status: 'open', assignee: 'Ada' },
      { id: 'task-closed', title: 'Closed item', status: 'closed', assignee: 'Ada' },
      { id: 'task-unassigned', title: 'Lonely', status: 'open', assignee: '' },
    ];

    (provider as any).items = items;

    provider.toggleClosedVisibility();

    const contexts = vscodeStub.commands._calls
      .filter((c: any) => c.command === 'setContext')
      .reduce((acc: any, c: any) => {
        acc[c.args[0]] = c.args[1];
        return acc;
      }, {} as Record<string, any>);

    assert.strictEqual(contexts['beady.showClosed'], false);
    assert.strictEqual(contexts['beady.closedHidden'], true);

    const roots = await provider.getChildren();
    const sections = roots.filter((n: any) => n.contextValue === 'assigneeSection');
    const adaSection = sections.find((n: any) => n.assignee === 'Ada');
    assert.ok(adaSection, 'assignee section should exist');
    const adaChildren = await provider.getChildren(adaSection!);
    assert.deepStrictEqual(adaChildren.map((n: any) => n.bead.id), ['task-open']);

    // Persisted state respected by new provider
    const provider2 = new BeadsTreeDataProvider(context as any);
    (provider2 as any).sortMode = 'assignee';
    (provider2 as any).items = items;
    const roots2 = await provider2.getChildren();
    const adaSection2 = roots2.find((n: any) => n.contextValue === 'assigneeSection' && n.assignee === 'Ada');
    const adaChildren2 = await provider2.getChildren(adaSection2!);
    assert.deepStrictEqual(adaChildren2.map((n: any) => n.bead.id), ['task-open']);
  });
});
