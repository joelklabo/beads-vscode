import * as assert from 'assert';
import Module = require('module');

describe('activation/contextState', () => {
  const originalLoad = (Module as any)._load;
  let setContextCalls: Array<[string, any]>;
  let syncQuickFilterCalls = 0;
  let setSortPickerEnabledCalls: boolean[] = [];
  let setFeedbackEnabledCalls: boolean[] = [];
  let warnCalls: string[] = [];

  const disposable = { dispose: () => undefined };

  const vscodeStub: any = {
    commands: {
      executeCommand: (key: string, value?: any) => {
        setContextCalls.push([key, value]);
        return Promise.resolve();
      },
    },
    workspace: {
      workspaceFolders: [
        { uri: { fsPath: '/wsa' } },
        { uri: { fsPath: '/wsb' } },
      ],
      getConfiguration: (_section?: string) => ({
        get: (_k: string, fallback: any) => fallback,
      }),
      onDidChangeConfiguration: () => disposable,
      onDidChangeWorkspaceFolders: () => disposable,
    },
  };

  const workspaceUtils = {
    getWorkspaceOptions: (_folders?: any[]) => [
      { id: 'wsa', label: 'Workspace A' },
      { id: 'wsb', label: 'Workspace B' },
    ],
  };

  const bulkConfig = { enabled: true, maxSelection: 10 };
  const feedbackEnablement = { enabled: true };

  const runtimeEnv = {
    warnIfDependencyEditingUnsupported: (ws: any) => warnCalls.push(ws.uri.fsPath),
  };

  const providerStub = {
    getActiveWorkspaceId: () => 'wsb',
    syncQuickFilterContext: () => { syncQuickFilterCalls += 1; },
    setSortPickerEnabled: (enabled: boolean) => setSortPickerEnabledCalls.push(enabled),
    setFeedbackEnabled: (enabled: boolean) => setFeedbackEnabledCalls.push(enabled),
  } as any;

  function loadModule() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../activation/contextState') as typeof import('../../activation/contextState');
  }

  beforeEach(() => {
    setContextCalls = [];
    syncQuickFilterCalls = 0;
    setSortPickerEnabledCalls = [];
    setFeedbackEnabledCalls = [];
    warnCalls = [];

    (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request.includes('./utils/workspace')) {
        return workspaceUtils;
      }
      if (request.includes('./utils/config')) {
        return { getBulkActionsConfig: () => bulkConfig };
      }
      if (request.includes('./feedback/enablement')) {
        return { computeFeedbackEnablement: () => feedbackEnablement };
      }
      if (request.includes('./services/runtimeEnvironment')) {
        return runtimeEnv;
      }
      return originalLoad.call(Module, request, parent, isMain);
    } as any;

    // clear cache to force fresh imports
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activation/contextState')) {
        delete require.cache[key];
      }
    });
  });

  afterEach(() => {
    (Module as any)._load = originalLoad;
  });

  it('applies workspace/bulk/quick/sort/favorites/feedback contexts', () => {
    const { contextStateManager } = loadModule();

    contextStateManager.applyWorkspaceContext(providerStub as any);
    contextStateManager.applyBulkActionsContext();
    contextStateManager.applyQuickFiltersContext(providerStub as any);
    contextStateManager.applySortPickerContext(providerStub as any);
    contextStateManager.applyFavoritesContext();
    contextStateManager.applyFeedbackContext(providerStub as any);

    assert.deepStrictEqual(setContextCalls, [
      ['beady.multiRootAvailable', true],
      ['beady.activeWorkspaceLabel', 'Workspace B'],
      ['beady.bulkActionsEnabled', true],
      ['beady.bulkActionsMaxSelection', 10],
      ['beady.quickFiltersEnabled', false],
      ['beady.sortPickerEnabled', true],
      ['beady.favoritesEnabled', false],
      ['beady.feedbackEnabled', true],
    ]);
    assert.strictEqual(syncQuickFilterCalls, 1);
    assert.deepStrictEqual(setSortPickerEnabledCalls, [true]);
    assert.deepStrictEqual(setFeedbackEnabledCalls, [true]);
  });

  it('registerContextWatchers wires config and workspace listeners', () => {
    const { registerContextWatchers } = loadModule();
    const context = { subscriptions: [] as any[] } as any;

    const disposables = registerContextWatchers(context, providerStub as any) as unknown as any[];

    assert.strictEqual(disposables.length, 2);
    assert.strictEqual(context.subscriptions.length, 2);
    assert.deepStrictEqual(warnCalls, ['/wsa', '/wsb']);
  });
});
