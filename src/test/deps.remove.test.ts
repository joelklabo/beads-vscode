import * as assert from 'assert';
import Module = require('module');
import { stripNoDaemon } from './utils/webview';

function createVscodeStub() {
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
      showWarningMessage: (...args: any[]) => {
        const message = args[0];
        warnings.push(message);
        const actionArgs = typeof args[1] === 'object' && !Array.isArray(args[1]) ? args.slice(2) : args.slice(1);
        const firstAction = actionArgs.find((v: any) => typeof v === 'string');
        return Promise.resolve(firstAction);
      },
      showQuickPick: (items: any[]) => Promise.resolve(items ? items[0] : undefined),
      createTreeView: () => ({ selection: [], onDidExpandElement: () => ({ dispose() {} }), onDidCollapseElement: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'enableDependencyEditing') {
            return true;
          }
          if (key === 'enableWorktreeGuard') {
            return false;
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
    _info: info,
    _warnings: warnings,
    _errors: errors,
  };

  return vscodeStub;
}

describe('removeDependency command', () => {
  let vscodeStub: any;
  let execCalls: Array<{ file: any; args: any; options: any }>;
  let failMissing = false;
  let restoreLoad: any;
  let BeadsTreeDataProvider: any;

  beforeEach(() => {
    execCalls = [];
    failMissing = false;
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createVscodeStub();

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
            if (failMissing) {
              const err: any = new Error('dependency not found');
              err.stderr = 'dependency not found';
              cb(err);
            } else {
              cb(null, { stdout: '', stderr: '' });
            }
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    const modulesToClear = ['../extension', '../utils', '../utils/cli', '../providers/beads/store'];
    modulesToClear.forEach((id) => {
      try {
        delete require.cache[require.resolve(id)];
      } catch {
        // ignore cache misses
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('calls bd dep remove after confirmation and refreshes', async () => {
    const context = { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
    const provider = new BeadsTreeDataProvider(context);
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };
    (provider as any).items = [
      { id: 'A', title: 'A', raw: { dependencies: [{ depends_on_id: 'B', dep_type: 'blocks' }] } },
      { id: 'B', title: 'B', raw: { dependencies: [] } },
    ];

    await provider.removeDependency('A', 'B');

    const depCall = execCalls.find(call => Array.isArray(call.args) && stripNoDaemon(call.args)[0] === 'dep');
    assert.ok(depCall, 'bd dep remove should be invoked');
    assert.deepStrictEqual(depCall!.file, 'bd');
    assert.strictEqual(depCall!.args[0], '--no-daemon');
    assert.deepStrictEqual(stripNoDaemon(depCall!.args), ['dep', 'remove', 'A', 'B']);
    assert.ok((provider as any)._refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.includes('Removed dependency')));
    provider.dispose();
  });

  it('shows warning when dependency already removed', async () => {
    failMissing = true;
    const context = { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
    const provider = new BeadsTreeDataProvider(context);
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };
    (provider as any).items = [
      { id: 'X', title: 'X', raw: { dependencies: [{ depends_on_id: 'Y' }] } },
      { id: 'Y', title: 'Y', raw: { dependencies: [] } },
    ];

    await provider.removeDependency('X', 'Y');

    const depCall = execCalls.find(call => Array.isArray(call.args) && stripNoDaemon(call.args)[0] === 'dep');
    assert.ok(depCall, 'bd dep remove should be invoked');
    assert.strictEqual(depCall!.args[0], '--no-daemon');
    assert.deepStrictEqual(stripNoDaemon(depCall!.args), ['dep', 'remove', 'X', 'Y']);
    assert.ok((provider as any)._refreshed, 'refresh should still run on missing dependency');
    const warningText = vscodeStub._warnings.join(' ').toLowerCase();
    assert.ok(/already removed|not found|does not exist|no dependency/.test(warningText), 'should warn when dependency is missing');
    provider.dispose();
  });
});
