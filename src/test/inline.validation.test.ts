import * as assert from 'assert';
import Module = require('module');

type ExecCall = { file: any; args: any; options: any };

describe('Inline edit validation', () => {
  let vscodeStub: any;
  let execCalls: ExecCall[];
  const normalizeArgs = (args: any[]) => (Array.isArray(args) && args[0] === '--no-daemon' ? args.slice(1) : args);
  let restoreLoad: any;
  let BeadsTreeDataProvider: any;
  let BeadTreeItem: any;
  let provider: any;
  let failIds: Set<string>;

  function createVscodeStub() {
    const info: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    class EventEmitter<T> {
      private listeners: Array<(e: T) => void> = [];
      public event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
      };
      fire(data?: T): void { this.listeners.forEach(listener => listener(data as T)); }
      dispose(): void { this.listeners = []; }
    }

    class TreeItem { constructor(public label?: any, public collapsibleState: number = 0) {} }

    class MarkdownString {
      value = '';
      isTrusted = false;
      supportHtml = false;
      appendMarkdown(md: string): void {
        this.value += md;
      }
    }

    const t = (message: string, ...args: any[]) =>
      message.replace(/\{(\d+)\}/g, (_m, index) => String(args[Number(index)] ?? `{${index}}`));

    return {
      l10n: { t },
      env: { language: 'en', openExternal: () => undefined },
      TreeItem,
      MarkdownString,
      EventEmitter,
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      StatusBarAlignment: { Left: 1 },
      ThemeIcon: class { constructor(public id: string) {} },
      ThemeColor: class { constructor(public id: string) {} },
      window: {
        showInformationMessage: (message: string) => { info.push(message); return Promise.resolve(undefined); },
        showWarningMessage: (message: string) => { warnings.push(message); return Promise.resolve(undefined); },
        showErrorMessage: (message: string) => { errors.push(message); return Promise.resolve(undefined); },
        showQuickPick: async (items: any[]) => items?.[items.length - 1],
        createTreeView: () => ({ selection: [] as any[], onDidExpandElement: () => ({ dispose() {} }), onDidCollapseElement: () => ({ dispose() {} }) }),
        createStatusBarItem: () => ({ text: '', tooltip: '', command: undefined, show() {}, hide() {}, dispose() {} }),
        withProgress: async (_options: any, task: any) => task({ report: () => undefined })
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
        getConfiguration: () => ({
          get: (key: string, fallback: any) => {
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
  }

  function createContextStub() {
    return { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } } as any;
  }

  beforeEach(() => {
    execCalls = [];
    failIds = new Set();
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
            const normalizedArgs = normalizeArgs(args);
            const id = Array.isArray(normalizedArgs) ? normalizedArgs[1] : undefined;
            const error = id && failIds.has(id) ? new Error(`cli failed for ${id} at /tmp/project/token xoxb-1234567890`) : null;
            execCalls.push({ file, args, options: opts });
            cb(error, { stdout: '', stderr: '' });
          },
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('@beads/core')];
    delete require.cache[require.resolve('@beads/core/out/cliClient')];
    delete require.cache[require.resolve('../utils')];
    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../extension')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
    BeadTreeItem = extension.BeadTreeItem;
  });

  afterEach(() => {
    provider?.dispose?.();
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('blocks empty titles before calling CLI', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).refresh = async () => undefined;
    const item = new BeadTreeItem({ id: 'A', title: 'A', status: 'open' });

    await provider.updateTitle(item, '   ');

    assert.strictEqual(execCalls.length, 0);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('title')));
  });

  it('rejects unsafe labels with control characters', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).refresh = async () => undefined;
    const item = new BeadTreeItem({ id: 'B', title: 'B', status: 'open' });

    await provider.addLabel(item, 'bad\nlabel');

    assert.strictEqual(execCalls.length, 0);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('label')));
  });

  it('rejects invalid status before CLI', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).refresh = async () => undefined;
    const item = new BeadTreeItem({ id: 'C', title: 'C', status: 'open' });

    await provider.updateStatus(item, 'not_a_status');

    assert.strictEqual(execCalls.length, 0);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('invalid status')));
  });

  it('sanitizes CLI errors to avoid leaking paths and tokens', async () => {
    provider = new BeadsTreeDataProvider(createContextStub());
    (provider as any).refresh = async () => undefined;
    const item = new BeadTreeItem({ id: 'D', title: 'D', status: 'open' });
    failIds.add('D');

    await provider.updateTitle(item, 'Valid Title');

    const updateCalls = execCalls.filter((call) => {
      const args = normalizeArgs(call.args);
      return Array.isArray(args) && args[0] === 'update';
    });

    assert.strictEqual(updateCalls.length, 1, 'cli should be invoked once');
    const surfaced = [...vscodeStub._errors].join(' ');
    assert.ok(!surfaced.includes('/tmp/project'), 'path should be redacted');
    assert.ok(!surfaced.includes('xoxb-'), 'token should be redacted');
  });
});
