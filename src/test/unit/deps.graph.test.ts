/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');
import { BeadItemData } from '@beads/core';
import {
  buildDependencyAdjacency,
  buildDependencyTrees,
  GraphEdgeData,
  validateEdgeAddition,
  willCreateDependencyCycle,
} from '@beads/core';

describe('Dependency graph helpers', () => {
  let restoreLoad: any;
  let addDependencyCommand: any;
  let collectDependencyEdges: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

    class TreeItem {
      constructor(public label?: any, public collapsibleState: number = 0) {}
    }

    const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

    class ThemeIcon {
      constructor(public id: string, public color?: any) {}
    }

    class ThemeColor {
      constructor(public id: string) {}
    }

    class MarkdownString {
      value = '';
      isTrusted = false;
      supportHtml = false;
      appendMarkdown(md: string): void {
        this.value += md;
      }
    }

    const vscodeStub = {
      l10n: { t },
      env: { language: 'en' },
      TreeItem,
      TreeItemCollapsibleState,
      ThemeIcon,
      ThemeColor,
      MarkdownString,
      workspace: {
        getConfiguration: () => ({
          get: (key: string, fallback: any) => (key === 'enableDependencyEditing' ? true : fallback),
        }),
        workspaceFolders: [],
      },
      window: {
        showWarningMessage: () => undefined,
        showInformationMessage: () => undefined,
        showQuickPick: () => {
          throw new Error('Quick pick should not be invoked when ids are provided');
        },
      },
      Uri: {
        file: (fsPath: string) => ({ fsPath }),
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../../extension')];
    const extension = require('../../extension');
    addDependencyCommand = extension.addDependencyCommand;
    collectDependencyEdges = extension.collectDependencyEdges;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    delete require.cache[require.resolve('../../extension')];
  });

  it('collectDependencyEdges builds edges with types and titles', () => {
    const items: BeadItemData[] = [
      { id: 'A', title: 'Alpha', raw: { dependencies: [{ depends_on_id: 'B', dep_type: 'blocks' }] } as any } as BeadItemData,
      { id: 'B', title: 'Beta', raw: { dependencies: [] } as any } as BeadItemData,
    ];

    const edges = collectDependencyEdges(items);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].sourceId, 'A');
    assert.strictEqual(edges[0].targetId, 'B');
    assert.strictEqual(edges[0].type, 'blocks');
    assert.strictEqual(edges[0].sourceTitle, 'Alpha');
    assert.strictEqual(edges[0].targetTitle, 'Beta');
  });

  it('addDependencyCommand uses provided ids without prompting', async () => {
    let added: { source: string; targetId: string } | undefined;
    const items: BeadItemData[] = [
      { id: 'A', title: 'Alpha', raw: { dependencies: [] } as any } as BeadItemData,
      { id: 'B', title: 'Beta', raw: { dependencies: [] } as any } as BeadItemData,
    ];

    const provider = {
      addDependency: async (source: BeadItemData, targetId: string) => {
        added = { source: source.id, targetId };
      },
      ['items']: items,
    } as any;

    await addDependencyCommand(provider, undefined, { sourceId: 'A', targetId: 'B' });
    assert.deepStrictEqual(added, { source: 'A', targetId: 'B' });
  });

  it('prevents duplicate and cyclic edge additions', () => {
    const edges: GraphEdgeData[] = [
      { sourceId: 'A', targetId: 'B' },
      { sourceId: 'B', targetId: 'C' },
    ];

    const duplicate = validateEdgeAddition(edges, 'A', 'B');
    assert.strictEqual(duplicate.valid, false);
    assert.strictEqual(duplicate.reason, 'duplicate');

    const cyclic = validateEdgeAddition(edges, 'C', 'A');
    assert.strictEqual(cyclic.valid, false);
    assert.strictEqual(cyclic.reason, 'cycle');

    const ok = validateEdgeAddition(edges, 'C', 'D');
    assert.strictEqual(ok.valid, true);
  });

  it('detects cycles for new edges', () => {
    const edges: GraphEdgeData[] = [
      { sourceId: 'X', targetId: 'Y' },
      { sourceId: 'Y', targetId: 'Z' },
    ];
    assert.strictEqual(willCreateDependencyCycle(edges, 'Z', 'X'), true);
    assert.strictEqual(willCreateDependencyCycle(edges, 'Z', 'Y'), true);
  });

  it('builds upstream and downstream trees with direction metadata', () => {
    const items: BeadItemData[] = [
      {
        id: 'ROOT',
        title: 'Root',
        status: 'open',
        raw: { dependencies: [{ depends_on_id: 'BLOCK', dep_type: 'blocks' }, { depends_on_id: 'MISSING' }] },
      } as BeadItemData,
      {
        id: 'BLOCK',
        title: 'Blocker',
        status: 'blocked',
        raw: { dependencies: [{ depends_on_id: 'LEAF', dep_type: 'parent-child' }] },
      } as BeadItemData,
      { id: 'LEAF', title: 'Leaf', status: 'open', raw: { dependencies: [] } as any } as BeadItemData,
      {
        id: 'DOWN',
        title: 'Downstream',
        status: 'in_progress',
        raw: { dependencies: [{ depends_on_id: 'ROOT', dep_type: 'related' }] },
      } as BeadItemData,
      {
        id: 'DOWN-CHILD',
        title: 'Down Child',
        status: 'closed',
        raw: { dependencies: [{ depends_on_id: 'DOWN', dep_type: 'blocks' }] },
      } as BeadItemData,
    ];

    const adjacency = buildDependencyAdjacency(items, 'ROOT');
    assert.deepStrictEqual(
      adjacency.upstream.map((n) => ({ id: n.id, type: n.type, direction: n.direction, missing: n.missing })),
      [
        { id: 'BLOCK', type: 'blocks', direction: 'upstream', missing: false },
        { id: 'MISSING', type: 'related', direction: 'upstream', missing: true },
      ]
    );

    assert.strictEqual(adjacency.downstream.length, 1);
    assert.strictEqual(adjacency.downstream[0].id, 'DOWN');
    assert.strictEqual(adjacency.downstream[0].direction, 'downstream');

    const trees = buildDependencyTrees(items, 'ROOT');

    const blocker = trees.upstream.find((n) => n.id === 'BLOCK');
    assert.ok(blocker);
    assert.strictEqual(blocker?.children[0].id, 'LEAF');
    assert.strictEqual(blocker?.children[0].direction, 'upstream');

    const missing = trees.upstream.find((n) => n.id === 'MISSING');
    assert.ok(missing?.missing);
    assert.deepStrictEqual(missing?.children, []);

    const down = trees.downstream[0];
    assert.strictEqual(down.id, 'DOWN');
    assert.strictEqual(down.direction, 'downstream');
    assert.deepStrictEqual(down.children.map((c) => c.id), ['DOWN-CHILD']);
  });
});
