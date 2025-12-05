import * as assert from 'assert';
import Module = require('module');
import { executeBulkLabelUpdate } from '../utils/bulk';

function createVscodeStub(options: { bulkEnabled?: boolean; maxSelection?: number; projectRoot?: string } = {}) {
  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let inputValue = 'urgent';

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

  const vscodeStub: any = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1 },
    ThemeIcon: class { constructor(public id: string) {} },
    ThemeColor: class { constructor(public id: string) {} },
    MarkdownString: class {
      constructor(public value: string = '') {}
      appendMarkdown(md: string): void { this.value += md; }
      appendText(text: string): void { this.value += text; }
    },
    window: {
      showInformationMessage: (message: string) => { info.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message: string, ...rest: any[]) => {
        warnings.push(message);
        const optionsArg = rest.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg));
        const actions = rest.filter((arg) => typeof arg === 'string');
        if (optionsArg?.modal && actions.length > 0) {
          return Promise.resolve(actions[0]);
        }
        return Promise.resolve(undefined);
      },
      showErrorMessage: (message: string) => { errors.push(message); return Promise.resolve(undefined); },
      showInputBox: async () => inputValue,
      withProgress: async (_options: any, task: any) => task({ report: () => undefined }),
      createTreeView: () => ({ selection: [] as any[] }),
      createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: options.projectRoot ?? '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'bulkActions.enabled') {
            const val = options.bulkEnabled ?? true;
            return val;
          }
          if (key === 'bulkActions.maxSelection') {
            return options.maxSelection ?? 50;
          }
          if (key === 'projectRoot') {
            return options.projectRoot ?? '/tmp/project';
          }
          if (key === 'commandPath') {
            return 'bd';
          }
          if (key === 'favorites.enabled') {
            return false;
          }
          if (key === 'favorites.useLabelStorage') {
            return true;
          }
          if (key === 'inlineStatusChange.enabled') {
            return true;
          }
          return fallback;
        },
      }),
      getWorkspaceFolder: () => ({ uri: { fsPath: options.projectRoot ?? '/tmp/project' } }),
      createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
    },
    commands: { executeCommand: () => undefined },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (...parts: any[]) => ({ fsPath: parts.map((p) => (typeof p === 'string' ? p : p.fsPath)).join('/') }),
    },
    RelativePattern: class {},
    ProgressLocation: { Notification: 15 },
    _info: info,
    _warnings: warnings,
    _errors: errors,
    _setInput: (value: string) => { inputValue = value; },
  };

  return vscodeStub;
}

function createContextStub() {
  return { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
}

describe('Bulk label helpers', () => {
  it('runs runner for each id and collects successes and failures', async () => {
    const calls: string[] = [];

    const result = await executeBulkLabelUpdate(
      ['one', 'fail', 'two'],
      'urgent',
      'add',
      async (id: string) => {
        calls.push(id);
        if (id === 'fail') {
          throw new Error('nope');
        }
      }
    );

    assert.deepStrictEqual(calls, ['one', 'fail', 'two']);
    assert.deepStrictEqual(result.successes, ['one', 'two']);
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].id, 'fail');
    assert.ok(result.failures[0].error.includes('nope'));
  });

  it('reports progress for each id', async () => {
    const steps: Array<{ completed: number; total: number }> = [];

    await executeBulkLabelUpdate(
      ['a', 'b', 'c'],
      'needs-review',
      'remove',
      async () => Promise.resolve(),
      (completed, total) => steps.push({ completed, total })
    );

    assert.deepStrictEqual(steps, [
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ]);
  });
});

describe('bulkUpdateLabel command', () => {
  let moduleAny: any;
  let restoreLoad: any;
  let execCalls: Array<{ file: any; args: any; options: any }>;
  let failIds: Set<string>;
  let vscodeStub: any;
  let bulkUpdateLabel: any;
  let BeadsTreeDataProvider: any;
  let BeadTreeItem: any;
  let provider: any;

  beforeEach(() => {
    moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    execCalls = [];
    failIds = new Set();
  });

  afterEach(() => {
    provider?.dispose?.();
    const moduleRestore = Module as any;
    moduleRestore._load = restoreLoad;
  });

  function loadExtension(options: { bulkEnabled?: boolean } = {}) {
    vscodeStub = createVscodeStub(options);
    const originalLoad = restoreLoad;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request === 'child_process') {
        return {
          execFile: (file: any, args: any, opts: any, callback: any) => {
            let cb = callback;
            let optionsArg = opts;
            if (typeof optionsArg === 'function') {
              cb = optionsArg;
              optionsArg = undefined;
            }
            const id = Array.isArray(args) ? args[2] : undefined;
            const error = failIds.has(id) ? new Error('cli failed') : null;
            execCalls.push({ file, args, options: optionsArg });
            cb?.(error, { stdout: '', stderr: error ? 'cli failed' : '' });
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../utils')];
    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../utils/config')];
    delete require.cache[require.resolve('../providers/beads/store')];
    delete require.cache[require.resolve('../extension')];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    bulkUpdateLabel = extension.bulkUpdateLabel;
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
    BeadTreeItem = extension.BeadTreeItem;

    provider = new BeadsTreeDataProvider(createContextStub());
  }

  function makeSelection(ids: string[]) {
    (provider as any).items = ids.map((id) => ({ id, title: id }));
    return { selection: ids.map((_, idx) => new BeadTreeItem((provider as any).items[idx])) } as any;
  }

  it('adds label to unique selected beads', async () => {
    loadExtension();
    (provider as any).refresh = async () => { (provider as any)._refreshed = true; };

    const treeView = makeSelection(['A', 'A', 'B']);
    await bulkUpdateLabel(provider, treeView, 'add');

    const labelCalls = execCalls.filter((call) => Array.isArray(call.args) && call.args[0] === 'label');
    assert.deepStrictEqual(labelCalls.map((c) => c.args[2]), ['A', 'B']);
    assert.ok((provider as any)._refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.toLowerCase().includes('label')));
  });

  it('reports per-item failures and continues', async () => {
    failIds.add('B');
    loadExtension();
    (provider as any).refresh = async () => {};

    const treeView = makeSelection(['A', 'B']);
    await bulkUpdateLabel(provider, treeView, 'remove');

    const labelCalls = execCalls.filter((call) => Array.isArray(call.args) && call.args[0] === 'label');
    assert.strictEqual(labelCalls.length, 2);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.includes('B')));
  });

  it('validates label input before running', async () => {
    loadExtension();
    vscodeStub._setInput('   ');

    const treeView = makeSelection(['A']);
    await bulkUpdateLabel(provider, treeView, 'add');

    const labelCalls = execCalls.filter((call) => Array.isArray(call.args) && call.args[0] === 'label');
    assert.strictEqual(labelCalls.length, 0, 'No CLI calls expected for invalid label');
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('label')));
  });

  it('aborts when bulk actions disabled', async () => {
    loadExtension({ bulkEnabled: false });
    const treeView = makeSelection(['A']);

    await bulkUpdateLabel(provider, treeView, 'add');

    const labelCalls = execCalls.filter((call) => Array.isArray(call.args) && call.args[0] === 'label');
    assert.strictEqual(labelCalls.length, 0);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('bulk')));
  });
});
