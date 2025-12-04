import * as assert from 'assert';
import Module = require('module');

function createVscodeStub() {
  const configValues: Record<string, any> = {};
  const statusItems: any[] = [];

  class StatusBarItem {
    text = '';
    tooltip: string | undefined;
    command: string | undefined;
    visible = false;
    constructor(public readonly alignment: number, public readonly priority: number) {}
    show(): void {
      this.visible = true;
    }
    hide(): void {
      this.visible = false;
    }
    dispose(): void {
      /* no-op for tests */
    }
  }

  function EventEmitter<T>(this: any) {
    this.listener = undefined;
    this.event = (listener: (value: T) => any) => {
      this.listener = listener;
      return { dispose() {} };
    };
    this.fire = (data?: T) => {
      if (typeof this.listener === 'function') {
        this.listener(data as T);
      }
    };
    this.dispose = () => {
      this.listener = undefined;
    };
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const workspaceStub: any = {
    workspaceFolders: [] as any[],
    getConfiguration: () => ({
      get: (key: string, fallback: any) => (key in configValues ? configValues[key] : fallback),
    }),
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose() {} }),
      onDidCreate: () => ({ dispose() {} }),
      onDidDelete: () => ({ dispose() {} }),
      dispose: () => undefined,
    }),
  };

  return {
    __configValues: configValues,
    l10n: { t },
    env: { language: 'en', openExternal: async () => undefined },
    workspace: workspaceStub,
    window: {
      showWarningMessage: () => undefined,
      showErrorMessage: () => undefined,
      showInformationMessage: () => undefined,
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      createStatusBarItem: (alignment: number, priority: number) => {
        const item = new StatusBarItem(alignment, priority);
        statusItems.push(item);
        return item as any;
      },
      createTreeView: () => ({
        selection: [],
        onDidChangeSelection: () => ({ dispose() {} }),
        onDidExpandElement: () => ({ dispose() {} }),
        onDidCollapseElement: () => ({ dispose() {} }),
        badge: undefined as any,
      }),
      createWebviewPanel: () => ({
        webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) },
        onDidDispose: () => ({ dispose() {} }),
      }),
    },
    commands: {
      registerCommand: () => ({ dispose() {} }),
      executeCommand: () => undefined,
    },
    EventEmitter,
    StatusBarAlignment: { Left: 1 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(public id: string, public color?: any) {} },
    ThemeColor: class { constructor(public id: string) {} },
    MarkdownString: class { constructor(public value = '') {} },
    RelativePattern: class {},
    Uri: { file: (fsPath: string) => ({ fsPath }) },
  } as any;
}

describe('Feedback surfaces & enablement', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadsTreeDataProvider: any;
  let computeFeedbackEnablement: any;

  before(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    const enablementPath = require.resolve('../feedback/enablement');
    delete require.cache[enablementPath];
    const extensionPath = require.resolve('../extension');
    delete require.cache[extensionPath];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    computeFeedbackEnablement = require('../feedback/enablement').computeFeedbackEnablement;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BeadsTreeDataProvider = require('../extension').BeadsTreeDataProvider;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('enables feedback when flag is on and repository is valid', () => {
    const workspaceFolder = { uri: { fsPath: '/workspace' } } as any;
    const config = { get: (key: string, fallback: any) => (key === 'projectRoot' ? '/workspace' : fallback) } as any;
    const feedbackConfig = {
      enabled: true,
      repository: 'acme/widgets',
      owner: 'acme',
      repo: 'widgets',
      labels: { bug: 'bug', feature: 'enhancement', question: 'question', other: 'feedback' },
      useGitHubCli: false,
      includeAnonymizedLogs: true,
    };

    const result = computeFeedbackEnablement({ config, workspaceFolder, feedbackConfig } as any);
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.projectRoot, '/workspace');
    assert.strictEqual(result.config.repository, 'acme/widgets');
  });

  it('disables feedback when repository is missing or invalid', () => {
    const workspaceFolder = { uri: { fsPath: '/workspace' } } as any;
    const config = { get: (key: string, fallback: any) => (key === 'projectRoot' ? '/workspace' : fallback) } as any;
    const feedbackConfig = {
      enabled: false,
      repository: '',
      owner: undefined,
      repo: undefined,
      labels: { bug: 'bug', feature: 'enhancement', question: 'question', other: 'feedback' },
      useGitHubCli: false,
      includeAnonymizedLogs: true,
      validationError: 'feedback.repository must use owner/repo format',
    };

    const result = computeFeedbackEnablement({ config, workspaceFolder, feedbackConfig } as any);
    assert.strictEqual(result.enabled, false);
    assert.ok(result.reason?.includes('invalidConfig') || result.reason === 'flagDisabled');
  });

  it('shows feedback in the status bar when enabled and no stale tasks', () => {
    const context = {
      subscriptions: [],
      workspaceState: { get: () => undefined, update: () => undefined },
      globalState: { get: () => undefined, update: () => undefined },
      extensionUri: { fsPath: '/tmp' },
    } as any;

    const provider = new BeadsTreeDataProvider(context);
    const statusItem = vscodeStub.window.createStatusBarItem(vscodeStub.StatusBarAlignment.Left, 100);
    provider.setStatusBarItem(statusItem);

    provider.setFeedbackEnabled(true);
    (provider as any).updateStatusBar(0, 15);

    assert.strictEqual(statusItem.visible, true);
    assert.ok(statusItem.text.includes('Send Feedback'));
    assert.strictEqual(statusItem.command, 'beads.sendFeedback');

    provider.dispose();
  });

  it('prefers stale indicator over feedback when stale tasks exist', () => {
    const context = {
      subscriptions: [],
      workspaceState: { get: () => undefined, update: () => undefined },
      globalState: { get: () => undefined, update: () => undefined },
      extensionUri: { fsPath: '/tmp' },
    } as any;

    const provider = new BeadsTreeDataProvider(context);
    const statusItem = vscodeStub.window.createStatusBarItem(vscodeStub.StatusBarAlignment.Left, 100);
    provider.setStatusBarItem(statusItem);

    provider.setFeedbackEnabled(true);
    (provider as any).updateStatusBar(2, 10);

    assert.strictEqual(statusItem.visible, true);
    assert.ok(statusItem.text.includes('2 stale'));
    assert.strictEqual(statusItem.command, 'beadsExplorer.focus');

    provider.dispose();
  });
});
