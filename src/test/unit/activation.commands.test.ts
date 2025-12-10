import * as assert from 'assert';
import Module = require('module');

describe('activation/commands orchestrator', () => {
  let restoreLoad: any;
  let registerCommands: any;
  let registeredCommands: Map<string, any>;
  let openBeadCalls: any[];
  let openFromFeedCalls: any[];
  let visualizeCalls: number;
  let activityRefreshes: string[];

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;

    // Clear caches to ensure stubbed vscode is used
    Object.keys(require.cache).forEach((key) => {
      if (key.includes('activation/commands') || key.includes('commands') || key.includes('beads-vscode')) {
        delete require.cache[key];
      }
    });

    registeredCommands = new Map();
    openBeadCalls = [];
    openFromFeedCalls = [];
    visualizeCalls = 0;
    activityRefreshes = [];

    const vscodeStub = {
      l10n: {
        t: (value: string, ...args: unknown[]) =>
          value.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')),
      },
      commands: {
        registerCommand: (id: string, handler: any) => {
          registeredCommands.set(id, handler);
          return { dispose: () => registeredCommands.delete(id) };
        },
        executeCommand: () => undefined,
      },
      window: {
        showWarningMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showQuickPick: async () => undefined,
        showInputBox: async () => undefined,
        registerWebviewViewProvider: () => ({ dispose() {} }),
        createTreeView: () => ({
          selection: [],
          onDidChangeSelection: () => ({ dispose() {} }),
        }),
        createStatusBarItem: () => ({ dispose() {} }),
      },
      workspace: {
        getConfiguration: () => ({ get: (_: string, fallback?: unknown) => fallback ?? false }),
        workspaceFolders: [],
        onDidChangeConfiguration: () => ({ dispose() {} }),
        onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      },
      env: { clipboard: { writeText: async () => undefined } },
      Uri: { parse: (uri: string) => ({ fsPath: uri }) },
      TreeItem: class { constructor(public label?: any, public collapsibleState?: any) {} },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      ThemeIcon: class { constructor(public id: string) {} },
      ThemeColor: class { constructor(public id: string) {} },
      MarkdownString: class { appendMarkdown() {} },
      StatusBarAlignment: { Left: 1, Right: 2 },
      chat: {
        createChatParticipant: () => ({ dispose() {} }),
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request.includes('services/cliService')) {
        return { runBdCommand: async () => undefined };
      }
      return restoreLoad(request, parent, isMain);
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    registerCommands = require('../../activation/commands').registerCommands;
  });

  beforeEach(() => {
    registeredCommands.clear();
    openBeadCalls = [];
    openFromFeedCalls = [];
    visualizeCalls = 0;
    activityRefreshes = [];
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  function createActivationContext() {
    const provider = {
      refresh: async () => {
        provider.refreshCount = (provider.refreshCount ?? 0) + 1;
      },
      search: async () => undefined,
      clearSearch: () => undefined,
      clearSortOrder: () => {
        provider.clearSortCount = (provider.clearSortCount ?? 0) + 1;
      },
      toggleClosedVisibility: async () => undefined,
      updateExternalReference: async () => undefined,
      setTreeView: () => undefined,
      setStatusBarItem: () => undefined,
      handleWorkspaceFoldersChanged: () => undefined,
      setSortPickerEnabled: () => undefined,
      syncQuickFilterContext: () => undefined,
      setFeedbackEnabled: () => undefined,
      getActiveWorkspaceId: () => undefined,
      items: [],
    } as any;

    const treeView = { selection: [] as any[], onDidChangeSelection: () => ({ dispose() {} }) } as any;
    const dependencyTreeProvider = {
      setRoot: (id: string) => {
        dependencyTreeProvider.rootId = id;
      },
      getRootId: () => dependencyTreeProvider.rootId,
      refresh: () => undefined,
    } as any;

    const activityFeedProvider = {
      refresh: (mode: string) => activityRefreshes.push(mode),
      clearFilters: () => undefined,
      setEventTypeFilter: () => undefined,
      setTimeRangeFilter: () => undefined,
    } as any;

    const activityFeedView = { selection: [] } as any;

    return {
      provider,
      treeView,
      dependencyTreeProvider,
      dependencyTreeView: {} as any,
      activityFeedProvider,
      activityFeedView,
    };
  }

  function registerAllCommands(): any {
    const context = { subscriptions: [] as any[] };
    const activationContext = createActivationContext();

    registerCommands(
      context,
      activationContext,
      (item: any) => (typeof item === 'object' ? item : { id: item }),
      async (item: any) => openBeadCalls.push(item),
      async (id: string) => {
        openFromFeedCalls.push(id);
        return true;
      },
      async () => undefined,
      async () => undefined,
      async (items: any[] | undefined) => items?.[0],
      async () => {
        visualizeCalls += 1;
      }
    );

    return { context, activationContext };
  }

  it('registers core and custom command ids', () => {
    registerAllCommands();

    const expectedIds = [
      'beady.refresh',
      'beady.bulkUpdateStatus',
      'beady.addDependency',
      'beady.inlineEditTitle',
      'beady.toggleFavorite',
      'beady.activityFeed.openEvent',
      'beady.visualizeDependencies',
      'beady.deleteBeads',
    ];

    for (const id of expectedIds) {
      assert.ok(registeredCommands.has(id), `expected command ${id} to be registered`);
    }
  });

  it('delegates handlers to providers and helpers', async () => {
    const { activationContext } = registerAllCommands();

    await registeredCommands.get('beady.refresh')();
    assert.strictEqual(activationContext.provider.refreshCount, 1);

    await registeredCommands.get('beady.openBead')('abc');
    assert.strictEqual(openBeadCalls.length, 1);
    assert.strictEqual(openBeadCalls[0].id, 'abc');

    await registeredCommands.get('beady.activityFeed.openEvent')('issue-123');
    assert.deepStrictEqual(openFromFeedCalls, ['issue-123']);

    await registeredCommands.get('beady.visualizeDependencies')();
    assert.strictEqual(visualizeCalls, 1);

    await registeredCommands.get('beady.refreshActivityFeed')();
    assert.deepStrictEqual(activityRefreshes, ['manual']);

    await registeredCommands.get('beady.clearSortOrder')();
    assert.strictEqual(activationContext.provider.clearSortCount, 1);
  });
});
