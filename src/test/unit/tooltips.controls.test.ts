import * as assert from 'assert';
import Module = require('module');

// Minimal vscode stub reused across tooltip tests
function createVscodeStub() {
  const configValues: Record<string, any> = {};

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
      /* noop */
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

  return {
    __configValues: configValues,
    l10n: { t },
    env: { language: 'en', openExternal: async () => undefined },
    workspace: {
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
    },
    window: {
      showWarningMessage: () => undefined,
      showErrorMessage: () => undefined,
      showInformationMessage: () => undefined,
      createStatusBarItem: (alignment: number, priority: number) => new StatusBarItem(alignment, priority),
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

describe('Control tooltips', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nls = require('../../../package.nls.json');

  const resolve = (key: string): string => nls[key] ?? '';

  it('clear search tooltip includes shortcut hint', () => {
    const text = resolve('command.beads.clearSearch');
    assert.match(text, /clear search/i);
    assert.match(text, /esc/i);
  });

  it('toggle sort tooltip describes cycling', () => {
    const text = resolve('command.beads.toggleSortMode');
    assert.match(text, /cycle/i);
    assert.match(text, /sort/i);
  });

  it('visualize dependencies tooltip mentions graph', () => {
    const text = resolve('command.beads.visualizeDependencies');
    assert.match(text, /(visualize|graph)/i);
  });
});

describe('Status bar tooltips', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadsTreeDataProvider: any;

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

    delete require.cache[require.resolve('../../extension')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BeadsTreeDataProvider = require('../../extension').BeadsTreeDataProvider;
  });

  after(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('shows localized tooltip for stale tasks', () => {
    const context = {
      subscriptions: [],
      workspaceState: { get: () => undefined, update: () => undefined },
      globalState: { get: () => undefined, update: () => undefined },
      extensionUri: { fsPath: '/tmp' },
    } as any;

    const provider = new BeadsTreeDataProvider(context);
    const statusItem = vscodeStub.window.createStatusBarItem(vscodeStub.StatusBarAlignment.Left, 100);
    provider.setStatusBarItem(statusItem);

    (provider as any).updateStatusBar(3, 20);

    assert.ok(statusItem.tooltip?.includes('3'));
    assert.ok(statusItem.tooltip?.includes('20'));
    assert.strictEqual(statusItem.command, 'beadsExplorer.focus');
  });

  it('shows feedback tooltip when no stale tasks', () => {
    const context = {
      subscriptions: [],
      workspaceState: { get: () => undefined, update: () => undefined },
      globalState: { get: () => undefined, update: () => undefined },
      extensionUri: { fsPath: '/tmp' },
    } as any;

    const provider = new BeadsTreeDataProvider(context);
    provider.setFeedbackEnabled(true);
    const statusItem = vscodeStub.window.createStatusBarItem(vscodeStub.StatusBarAlignment.Left, 100);
    provider.setStatusBarItem(statusItem);

    (provider as any).updateStatusBar(0, 10);

    assert.ok(statusItem.tooltip?.toLowerCase().includes('feedback'));
    assert.strictEqual(statusItem.command, 'beads.sendFeedback');
  });
});
