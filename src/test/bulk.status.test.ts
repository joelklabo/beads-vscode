import * as assert from 'assert';
import Module = require('module');
import { buildBulkSelection, executeBulkStatusUpdate } from '../utils/bulk';
import { BeadItemData } from '@beads/core';

describe('Bulk status helpers', () => {
  it('dedupes selection and enforces max selection', () => {
    const beads: BeadItemData[] = [
      { id: 'A' } as BeadItemData,
      { id: 'B' } as BeadItemData,
      { id: 'A' } as BeadItemData,
    ];

    const { ids, error } = buildBulkSelection(beads, 3);
    assert.deepStrictEqual(ids, ['A', 'B']);
    assert.strictEqual(error, undefined);

    const limited = buildBulkSelection(beads, 1);
    assert.ok(limited.error?.includes('1'));
    assert.deepStrictEqual(limited.ids, ['A', 'B']);
  });

  it('continues after failures and reports details', async () => {
    const calls: string[] = [];
    const result = await executeBulkStatusUpdate(
      ['ok-1', 'fail-me', 'ok-2'],
      'closed',
      async (id: string) => {
        calls.push(id);
        if (id === 'fail-me') {
          throw new Error('boom');
        }
      }
    );

    assert.deepStrictEqual(calls, ['ok-1', 'fail-me', 'ok-2']);
    assert.deepStrictEqual(result.successes, ['ok-1', 'ok-2']);
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].id, 'fail-me');
    assert.ok(result.failures[0].error.includes('boom'));
  });

  it('reports progress for each item', async () => {
    const steps: Array<{ completed: number; total: number }> = [];

    await executeBulkStatusUpdate(
      ['one', 'two'],
      'open',
      async () => Promise.resolve(),
      (completed, total) => steps.push({ completed, total })
    );

    assert.deepStrictEqual(steps, [
      { completed: 1, total: 2 },
      { completed: 2, total: 2 }
    ]);
  });
});


type BulkStubOptions = {
  bulkEnabled?: boolean;
  maxSelection?: number;
  quickPick?: { label: string; value: string } | undefined;
};

function createBulkVscodeStub(options: BulkStubOptions = {}) {
  const {
    bulkEnabled = true,
    maxSelection = 50,
    quickPick = { label: 'Open', value: 'open' },
  } = options;

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
    public tooltip?: any;
    constructor(label?: any, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon { constructor(public id: string) {} }
  class ThemeColor { constructor(public id: string) {} }
  class MarkdownString {
    constructor(public value = '') {}
    appendMarkdown(md: string): void { this.value += md; }
    appendText(text: string): void { this.value += text; }
  }

  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const contexts: Record<string, any> = {};

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const vscodeStub: any = {
    l10n: { t },
    env: { language: 'en', openExternal: () => undefined },
    TreeItem,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
    EventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ProgressLocation: { Notification: 15 },
    StatusBarAlignment: { Left: 1 },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (...parts: any[]) => ({ fsPath: parts.map(p => (typeof p === 'string' ? p : p.fsPath)).join('/') })
    },
    RelativePattern: class {},
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
      showQuickPick: async () => quickPick,
      withProgress: async (_options: any, task: any) => task({ report: () => undefined }),
      createTreeView: () => ({})
    },
    commands: {
      executeCommand: (_command: string, value: any) => { contexts[_command] = value; return Promise.resolve(); }
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'bulkActions.enabled') { return bulkEnabled; }
          if (key === 'bulkActions.maxSelection') { return maxSelection; }
          if (key === 'projectRoot') { return '/tmp/project'; }
          if (key === 'commandPath') { return 'bd'; }
          return fallback;
        }
      }),
      getWorkspaceFolder: () => ({ uri: { fsPath: '/tmp/project' } }),
      createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} })
    },
    _info: info,
    _warnings: warnings,
    _errors: errors,
    _contexts: contexts,
  };

  return vscodeStub;
}

describe('Bulk status command', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let bulkUpdateStatus: any;
  let BeadTreeItem: any;

  beforeEach(() => {
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    vscodeStub = createBulkVscodeStub();
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../extension')];
    delete require.cache[require.resolve('../utils/config')];
    delete require.cache[require.resolve('../utils/workspace')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    bulkUpdateStatus = extension.bulkUpdateStatus;
    BeadTreeItem = extension.BeadTreeItem;
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  it('updates selected beads and refreshes provider', async () => {
    const calls: Array<{ args: string[]; root: string }> = [];
    let refreshed = false;
    const provider = { refresh: async () => { refreshed = true; } } as any;
    const treeView = {
      selection: [new BeadTreeItem({ id: 'A', title: 'A' }), new BeadTreeItem({ id: 'B', title: 'B' })]
    } as any;

    await bulkUpdateStatus(provider, treeView, async (args: string[], root: string) => {
      calls.push({ args, root });
    });

    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls.map(c => c.args), [
      ['update', 'A', '--status', 'open'],
      ['update', 'B', '--status', 'open'],
    ]);
    assert.ok(refreshed, 'provider.refresh should be called');
    assert.ok(vscodeStub._info.some((msg: string) => msg.toLowerCase().includes('status')));
  });

  it('honors feature flag disablement', async () => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    vscodeStub = createBulkVscodeStub({ bulkEnabled: false });
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../extension')];
    delete require.cache[require.resolve('../utils/config')];
    delete require.cache[require.resolve('../utils/workspace')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    const fn = extension.bulkUpdateStatus;
    const treeView = { selection: [new extension.BeadTreeItem({ id: 'X', title: 'X' })] } as any;

    await fn({ refresh: async () => undefined } as any, treeView, async () => { throw new Error('should not run'); });

    assert.ok(vscodeStub._warnings.some((msg: string) => msg.includes('beads.bulkActions.enabled')));
  });

  it('enforces max selection limit', async () => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
    vscodeStub = createBulkVscodeStub({ maxSelection: 1 });
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../extension')];
    delete require.cache[require.resolve('../utils/config')];
    delete require.cache[require.resolve('../utils/workspace')];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    const fn = extension.bulkUpdateStatus;
    const treeView = { selection: [new extension.BeadTreeItem({ id: 'A' }), new extension.BeadTreeItem({ id: 'B' })] } as any;

    await fn({ refresh: async () => undefined } as any, treeView, async () => Promise.resolve());

    assert.strictEqual(vscodeStub._info.length, 0, 'No success message expected');
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.includes('Select at most')));
  });
});
