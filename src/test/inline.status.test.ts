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
  const errors: string[] = [];

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
      showErrorMessage: (message: string) => { errors.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message: string) => { warnings.push(message); return Promise.resolve(undefined); },
      showQuickPick: async (items: any[]) => items?.[items.length - 1],
      showSaveDialog: async () => undefined,
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
    _errors: errors,
  };

  return vscodeStub;
}

describe('Inline status quick change', () => {
  let vscodeStub: any;
  let execCalls: Array<{ file: any; args: any; options: any }>; let restoreLoad: any;
  let BeadsTreeDataProvider: any;
  let BeadTreeItem: any;
  let inlineStatusQuickChange: any;

  beforeEach(() => {
    execCalls = [];
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub(true);

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return {
          execFile: (file: any, args: any, options: any, callback: any) => {
            let cb = callback;
            let opts = options;
            if (typeof opts === 'function') {
              cb = opts;
              opts = undefined;
            }
            execCalls.push({ file, args, options: opts });
            cb(null, { stdout: '', stderr: '' });
          },
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
    inlineStatusQuickChange = (extension as any).inlineStatusQuickChange;
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('updates status for selected beads', async () => {
    const context = { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
    const provider = new BeadsTreeDataProvider(context);
    (provider as any).items = [
      { id: 'A', title: 'A', status: 'open' },
      { id: 'B', title: 'B', status: 'blocked' },
    ];
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };

    const treeView = { selection: [new BeadTreeItem((provider as any).items[0]), new BeadTreeItem((provider as any).items[1])] } as any;

    await inlineStatusQuickChange(provider, treeView, undefined);

    assert.strictEqual(execCalls.length, 2);
    assert.deepStrictEqual(execCalls[0].args, ['update', 'A', '--status', 'closed']);
    assert.deepStrictEqual(execCalls[1].args, ['update', 'B', '--status', 'closed']);
    assert.ok((provider as any)._refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.includes('Updated status')));
  });

  it('skips items already in target status', async () => {
    const context = { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
    const provider = new BeadsTreeDataProvider(context);
    (provider as any).items = [
      { id: 'C', title: 'C', status: 'closed' },
    ];
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };
    const treeView = { selection: [new BeadTreeItem((provider as any).items[0])] } as any;

    await inlineStatusQuickChange(provider, treeView, undefined);

    assert.strictEqual(execCalls.length, 0, 'No CLI calls for unchanged status');
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('skipped')));
  });

  it('respects feature flag disablement', async () => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    vscodeStub = createVscodeStub(false);
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return {
          execFile: (_file: any, _args: any, _options: any, callback: any) => callback(null, { stdout: '', stderr: '' }),
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../extension')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    const provider = new extension.BeadsTreeDataProvider({ subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any);
    const treeView = { selection: [] } as any;

    await extension.inlineStatusQuickChange(provider, treeView, undefined);

    assert.strictEqual(execCalls.length, 0);
    assert.ok(vscodeStub._info.some((msg: string) => msg.includes('Enable the "beads.inlineStatusChange.enabled" setting')));
  });
});
