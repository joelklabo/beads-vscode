import * as assert from 'assert';
import Module = require('module');

describe('activation/viewRegistry', () => {
  const originalLoad = (Module as any)._load;
  let selectionHandler: any;
  let expandHandler: any;
  let collapseHandler: any;
  let providerCalls: any[] = [];
  let setRootCalls: string[] = [];

  const disposable = { dispose: () => undefined };

  class DisposableEmitter<T = any> {
    private listeners: Array<(e: T) => void> = [];
    fire(value: T) { this.listeners.forEach((l) => l(value)); }
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
  }

  beforeEach(() => {
    selectionHandler = undefined;
    expandHandler = undefined;
    collapseHandler = undefined;
    providerCalls = [];
    setRootCalls = [];

    (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
      if (request === 'vscode') {
        const treeViewFactory = (_id: string, _opts: any) => {
          return {
            selection: [] as any[],
            onDidChangeSelection: (cb: any) => { selectionHandler = cb; return disposable; },
            onDidExpandElement: (cb: any) => { expandHandler = cb; return disposable; },
            onDidCollapseElement: (cb: any) => { collapseHandler = cb; return disposable; },
          } as any;
        };
        return {
          window: {
            createTreeView: treeViewFactory,
            registerWebviewViewProvider: () => disposable,
            createStatusBarItem: () => ({ dispose: () => undefined }) as any,
          },
          StatusBarAlignment: { Left: 1 },
        } as any;
      }
      if (request.includes('./providers/beads/treeDataProvider')) {
        return {
          BeadsTreeDataProvider: class {
            items: any[] = [];
            constructor(public context: any, public watch: any) {}
            setTreeView(view: any) { providerCalls.push(['setTree', view]); }
            setStatusBarItem(item: any) { providerCalls.push(['status', item]); }
            expandRow(item: any) { providerCalls.push(['expand', item]); }
            handleCollapseChange(item: any, collapsed: boolean) { providerCalls.push(['collapse', item, collapsed]); }
            onDidChangeTreeData() { providerCalls.push(['onChange']); return disposable; }
            dispose() { providerCalls.push(['dispose']); }
          },
        };
      }
      if (request.includes('./providers/beads/items')) {
        return { BeadTreeItem: class { constructor(public bead: any) {} } };
      }
      if (request.includes('./dependencyTreeProvider')) {
        return {
          DependencyTreeProvider: class {
            constructor(public _getItems: any) {}
            setRoot(id: string) { setRootCalls.push(id); }
            refresh() { providerCalls.push(['refresh']); }
          },
        };
      }
      if (request.includes('./providers/beads/webview')) {
        return { BeadsWebviewProvider: class {} };
      }
      if (request.includes('./activation/contextState')) {
        return {
          contextStateManager: {
            applyWorkspaceContext: () => providerCalls.push(['ctx', 'workspace']),
            applyBulkActionsContext: () => providerCalls.push(['ctx', 'bulk']),
            applyQuickFiltersContext: () => providerCalls.push(['ctx', 'quick']),
            applySortPickerContext: () => providerCalls.push(['ctx', 'sort']),
            applyFavoritesContext: () => providerCalls.push(['ctx', 'favorites']),
            applyFeedbackContext: () => providerCalls.push(['ctx', 'feedback']),
          },
        };
      }
      return originalLoad.call(Module, request, parent, isMain);
    } as any;

    Object.keys(require.cache).forEach((k) => {
      if (k.includes('activation/viewRegistry')) {
        delete require.cache[k];
      }
    });
  });

  afterEach(() => {
    (Module as any)._load = originalLoad;
  });

  it('wires tree/dependency providers and returns disposables', () => {
    const { createViewRegistry } = require('../../activation/viewRegistry') as typeof import('../../activation/viewRegistry');
    const context = { extensionUri: {}, subscriptions: [] as any[] } as any;
    const watch = {} as any;

    const result = createViewRegistry(context, watch);

    assert.ok(result.provider, 'provider created');
    assert.ok(result.treeView, 'treeView created');
    assert.ok(result.dependencyTreeProvider, 'dependency tree created');
    assert.ok(result.dependencyTreeView, 'dependency tree view created');
    assert.ok(Array.isArray(result.disposables));
    assert.ok(result.disposables.length >= 6);

    // simulate selection change to update dependency root
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const beadItem = new (require('../../providers/beads/items').BeadTreeItem)({ id: 'X' });
    selectionHandler?.({ selection: [beadItem] });
    assert.deepStrictEqual(setRootCalls, ['X']);

    // verify expand/collapse handlers call provider
    expandHandler?.({ element: 'row1' });
    collapseHandler?.({ element: 'row2' });
    assert.ok(providerCalls.some((c) => c[0] === 'collapse' && c[1] === 'row1' && c[2] === false));
  });
});
