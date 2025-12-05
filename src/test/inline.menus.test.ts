import * as assert from 'assert';
import Module = require('module');

function createVscodeStub(enableFlag = true) {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data?: T): void {
      this.listeners.forEach(listener => listener(data as T));
    }
    dispose(): void {
      this.listeners = [];
    }
  }

  class TreeItem {
    public label?: any;
    public collapsibleState: number;
    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const info: string[] = [];
  const warnings: string[] = [];

  let nextQuickPick: any = undefined;
  let nextInput: any = undefined;

  const vscodeStub: any = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1 },
    ThemeIcon: class { constructor(public id: string) {} },
    ThemeColor: class { constructor(public id: string) {} },
    window: {
      showInformationMessage: (message: string) => { info.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message: string) => { warnings.push(message); return Promise.resolve(undefined); },
      showQuickPick: async (items: any[]) => {
        if (nextQuickPick !== undefined) return nextQuickPick;
        return items?.[0];
      },
      showInputBox: async () => nextInput,
      createTreeView: () => ({ selection: [], onDidExpandElement: () => ({ dispose() {} }), onDidCollapseElement: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
      withProgress: async (_options: any, task: any) => task({ report: () => undefined })
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'inlineStatusChange.enabled') {
            return enableFlag;
          }
          if (key === 'projectRoot') {
            return '/tmp/project';
          }
          if (key === 'commandPath') {
            return 'bd';
          }
          return fallback;
        },
      }),
      getWorkspaceFolder: () => ({ uri: { fsPath: '/tmp/project' } }),
      createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (...parts: any[]) => ({ fsPath: parts.map((p) => (typeof p === 'string' ? p : p.fsPath)).join('/') }),
    },
    RelativePattern: class {},
    commands: { executeCommand: () => undefined },
    ProgressLocation: { Notification: 15 },
    _info: info,
    _warnings: warnings,
    _setNextQuickPick: (val: any) => { nextQuickPick = val; },
    _setNextInput: (val: any) => { nextInput = val; },
  };

  return vscodeStub;
}

describe('Inline edit commands', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let BeadsTreeDataProvider: any;
  let BeadTreeItem: any;
  let inlineEditTitle: any;
  let inlineEditLabels: any;
  let provider: any;
  let treeView: any;

  beforeEach(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub(true);

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return {
          execFile: (_file: any, _args: any, _opts: any, callback: any) => callback(null, { stdout: '', stderr: '' }),
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../utils')];
    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../extension')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
    BeadTreeItem = extension.BeadTreeItem;
    inlineEditTitle = (extension as any).inlineEditTitle;
    inlineEditLabels = (extension as any).inlineEditLabels;
  });

  afterEach(() => {
    provider?.dispose?.();
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  function createContextStub() {
    return { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
  }

  it('respects feature flag disablement for inline title', async () => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    vscodeStub = createVscodeStub(false);
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') return vscodeStub;
      return restoreLoad(request, parent, isMain);
    };
    delete require.cache[require.resolve('../extension')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    inlineEditTitle = (extension as any).inlineEditTitle;

    provider = new (extension as any).BeadsTreeDataProvider(createContextStub());
    treeView = { selection: [new (extension as any).BeadTreeItem({ id: 'X', title: 'X' })] } as any;

    await inlineEditTitle(provider, treeView);
    assert.ok(vscodeStub._info.some((msg: string) => msg.toLowerCase().includes('enable the "beads.inline')));
  });

  it('restores focus after inline title edit', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).items = [{ id: 'A', title: 'Old', raw: {} }];
    provider.updateTitle = async (bead: any, title: string) => { bead.title = title; };
    treeView = { selection: [new BeadTreeItem((provider as any).items[0])], reveal: async (_el: any, opts: any) => { treeView._revealed = opts; } } as any;

    vscodeStub._setNextInput('New Title');
    await inlineEditTitle(provider, treeView);

    assert.strictEqual((provider as any).items[0].title, 'New Title');
    assert.ok(treeView._revealed?.select, 'should reselect');
    assert.ok(treeView._revealed?.focus, 'should refocus');
  });

  it('adds a label via inline edit', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).items = [{ id: 'B', title: 'B', raw: {}, tags: [] }];
    provider.addLabel = async (bead: any, label: string) => { bead.tags.push(label); };
    treeView = { selection: [new BeadTreeItem((provider as any).items[0])], reveal: async () => {} } as any;

    vscodeStub._setNextInput('bug');
    await inlineEditLabels(provider, treeView);

    assert.deepStrictEqual((provider as any).items[0].tags, ['bug']);
  });
});
