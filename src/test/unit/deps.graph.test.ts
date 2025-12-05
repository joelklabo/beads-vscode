/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');
import { BeadItemData } from '../../utils';
import { validateEdgeAddition, willCreateDependencyCycle, GraphEdgeData } from '../../utils/graph';

describe('Dependency graph helpers', () => {
  let restoreLoad: any;
  let addDependencyCommand: any;
  let collectDependencyEdges: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

    const vscodeStub = {
      l10n: { t },
      env: { language: 'en' },
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
});
