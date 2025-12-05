import * as assert from 'assert';
import Module = require('module');
import { stripNoDaemon } from '../utils/webview';

function createVscodeStub() {
  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
    };
    fire(data?: T): void { this.listeners.forEach((listener) => listener(data as T)); }
    dispose(): void { this.listeners = []; }
  }

  class TreeItem {
    public label?: any;
    public description?: string;
    public collapsibleState: number;
    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void { this.value += md; }
  }

  const t = (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`));

  const vscodeStub: any = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    MarkdownString,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1 },
    ThemeIcon: class { constructor(public id: string, public color?: any) {} },
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
      showQuickPick: async (items: any[]) => items?.[0],
      createTreeView: () => ({ selection: [], onDidExpandElement: () => ({ dispose() {} }), onDidCollapseElement: () => ({ dispose() {} }) }),
      createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'enableDependencyEditing') return true;
          if (key === 'enableWorktreeGuard') return false;
          if (key === 'projectRoot') return '/tmp/project';
          if (key === 'commandPath') return 'bd';
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

suite('Dependency tree flows', () => {
  let restoreLoad: any;
  let execCalls: Array<{ file: any; args: any[]; options: any }>;
  let vscodeStub: any;
  let BeadsTreeDataProvider: any;
  let DependencyTreeProvider: any;

  setup(() => {
    execCalls = [];
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
            cb?.(null, { stdout: '', stderr: '' });
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    [
      '../../extension',
      '../../dependencyTreeProvider',
      '../../utils',
      '../../utils/cli',
      '../../providers/beads/store',
    ].forEach((id) => {
      try {
        delete require.cache[require.resolve(id)];
      } catch {
        // ignore cache misses
      }
    });

    delete require.cache[require.resolve('../../extension')];
    delete require.cache[require.resolve('../../dependencyTreeProvider')];
    const extension = require('../../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
    DependencyTreeProvider = require('../../dependencyTreeProvider').DependencyTreeProvider;
  });

  teardown(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    [
      '../../extension',
      '../../dependencyTreeProvider',
      '../../utils',
      '../../utils/cli',
      '../../providers/beads/store',
    ].forEach((id) => {
      try {
        delete require.cache[require.resolve(id)];
      } catch {
        // ignore cache misses
      }
    });
  });

  function bead(id: string, deps: Array<{ id: string; type?: string }> = []) {
    return {
      id,
      title: id,
      status: 'open',
      raw: { dependencies: deps.map((d) => ({ depends_on_id: d.id, dep_type: d.type || 'related' })) },
    } as any;
  }

  test('detail view add uses bd dep add with --no-daemon', async () => {
    const provider = new BeadsTreeDataProvider({ subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any);
    (provider as any).items = [bead('A'), bead('B')];
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };

    await provider.addDependency((provider as any).items[0], 'B');

    const depCall = execCalls.find((call) => stripNoDaemon(call.args)[0] === 'dep');
    assert.ok(depCall, 'bd dep add should be invoked');
    assert.strictEqual(depCall!.args[0], '--no-daemon');
    assert.deepStrictEqual(stripNoDaemon(depCall!.args), ['dep', 'add', 'A', 'B']);
    assert.ok((provider as any)._refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.includes('Added dependency')));
  });

  test('sidebar remove uses bd dep remove with --no-daemon', async () => {
    const provider = new BeadsTreeDataProvider({ subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any);
    (provider as any).items = [bead('A', [{ id: 'B' }]), bead('B')];
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };

    await provider.removeDependency('A', 'B');

    const depCall = execCalls.find((call) => stripNoDaemon(call.args)[0] === 'dep');
    assert.ok(depCall, 'bd dep remove should be invoked');
    assert.strictEqual(depCall!.args[0], '--no-daemon');
    assert.deepStrictEqual(stripNoDaemon(depCall!.args), ['dep', 'remove', 'A', 'B']);
    assert.ok((provider as any)._refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.includes('Removed dependency')));
  });

  test('duplicate/cycle attempts show warning instead of calling bd', async () => {
    const provider = new BeadsTreeDataProvider({ subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any);
    (provider as any).items = [
      bead('A', [{ id: 'B' }]),
      bead('B', [{ id: 'C' }]),
      bead('C'),
    ];

    await provider.addDependency((provider as any).items[2], 'A');

    assert.strictEqual(execCalls.length, 0, 'bd should not be called on cycle');
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('cycle')));
  });

  test('dependency tree provider exposes direction groups with type badges', async () => {
    const items = [bead('A', [{ id: 'B', type: 'blocks' }]), bead('B'), bead('C', [{ id: 'A', type: 'related' }])];
    const treeProvider = new DependencyTreeProvider(() => items);
    treeProvider.setRoot('A');

    const groups = await treeProvider.getChildren();
    assert.ok(Array.isArray(groups));
    assert.strictEqual(groups?.length, 2, 'upstream and downstream groups');

    const upstream = groups?.[0];
    const downstream = groups?.[1];
    assert.ok(String((upstream as any).label).toLowerCase().includes('upstream'));
    assert.ok(String((downstream as any).label).toLowerCase().includes('downstream'));

    const upstreamChildren = await treeProvider.getChildren(upstream as any);
    const downstreamChildren = await treeProvider.getChildren(downstream as any);
    assert.strictEqual(upstreamChildren?.length, 1);
    assert.strictEqual(downstreamChildren?.length, 1);
    assert.ok(String((upstreamChildren?.[0] as any).description).includes('blocks'));
    assert.ok(String((downstreamChildren?.[0] as any).description).includes('related'));
  });
});
