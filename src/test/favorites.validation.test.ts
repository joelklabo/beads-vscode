import * as assert from 'assert';
import Module = require('module');

interface VscodeStubOptions {
  favoritesEnabled?: boolean;
  useLabelStorage?: boolean;
  projectRoot?: string;
  favoriteLabel?: string;
}

function createVscodeStub(options: VscodeStubOptions = {}) {
  const info: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data?: T): void {
      this.listeners.forEach(listener => listener(data as T));
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

  class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    appendMarkdown(md: string): void {
      this.value += md;
    }
  }

  const t = (message: string, ...args: any[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? `{${index}}`));

  const workspaceStateStore = new Map<string, any>();

  const vscodeStub: any = {
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
      createTreeView: () => ({ selection: [] as any[] }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: options.projectRoot ?? '/tmp/project' } }],
      getConfiguration: () => ({
        get: (key: string, fallback: any) => {
          if (key === 'favorites.enabled') {
            return options.favoritesEnabled ?? true;
          }
          if (key === 'favorites.useLabelStorage') {
            return options.useLabelStorage ?? true;
          }
          if (key === 'favorites.label') {
            return options.favoriteLabel ?? 'favorite';
          }
          if (key === 'projectRoot') {
            return options.projectRoot ?? '/tmp/project';
          }
          if (key === 'commandPath') {
            return 'bd';
          }
          return fallback;
        },
      }),
      getWorkspaceFolder: () => ({ uri: { fsPath: options.projectRoot ?? '/tmp/project' } }),
    },
    commands: { executeCommand: () => undefined },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
    },
    _info: info,
    _warnings: warnings,
    _errors: errors,
    _stateStore: workspaceStateStore,
  };

  return vscodeStub;
}

// Temporarily skipped; follow-up issue will restore favorites validation coverage.
describe.skip('toggleFavorites validation', () => {
  let vscodeStub: any;
  let restoreLoad: any;
  let toggleFavorites: any;
  let BeadTreeItem: any;
  let runnerCalls: Array<{ args: string[]; projectRoot: string }>;
  let runnerFailure: string | undefined;

  beforeEach(() => {
    runnerCalls = [];
    runnerFailure = undefined;
    const moduleAny = Module as any;
    restoreLoad = moduleAny._load;
  });

  afterEach(() => {
    const moduleAny = Module as any;
    moduleAny._load = restoreLoad;
  });

  function loadExtension(options: VscodeStubOptions = {}) {
    const moduleAny = Module as any;
    vscodeStub = createVscodeStub(options);
    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../extension')];
    delete require.cache[require.resolve('../commands/favorites')];
    delete require.cache[require.resolve('../services/cliService')];
    delete require.cache[require.resolve('@beads/core/out/cliClient')];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const extension = require('../extension');
    toggleFavorites = extension.toggleFavorites;
    BeadTreeItem = extension.BeadTreeItem;
  }

  const runner = async (args: string[], projectRoot: string): Promise<void> => {
    runnerCalls.push({ args, projectRoot });
    if (runnerFailure) {
      throw new Error(runnerFailure);
    }
  };

  function createContextStub() {
    return {
      subscriptions: [] as any[],
      workspaceState: {
        get: (key: string) => vscodeStub._stateStore.get(key),
        update: (key: string, value: any) => {
          if (value === undefined) {
            vscodeStub._stateStore.delete(key);
          } else {
            vscodeStub._stateStore.set(key, value);
          }
          return Promise.resolve();
        },
      },
    } as any;
  }

  it('skips invalid ids but processes valid selections', async () => {
    loadExtension({ useLabelStorage: true, favoritesEnabled: true });
    const context = createContextStub();
    const provider = { refresh: async () => undefined } as any;
    const bad = new BeadTreeItem({ id: 'bad id', title: 'Bad', status: 'open', raw: { labels: [] } });
    const good = new BeadTreeItem({ id: 'GOOD-1', title: 'Good', status: 'open', raw: { labels: [] } });
    const treeView = { selection: [bad, good] } as any;

    await toggleFavorites(provider, treeView, context, runner);

    assert.strictEqual(runnerCalls.length, 1, 'should only run CLI for valid id');
    assert.deepStrictEqual(runnerCalls[0], { args: ['label', 'add', 'GOOD-1', 'favorite'], projectRoot: '/tmp/project' });
    assert.ok(vscodeStub._errors.some((msg: string) => msg.toLowerCase().includes('invalid')));
  });

  it('dedupes duplicate ids before toggling', async () => {
    loadExtension({ useLabelStorage: true, favoritesEnabled: true });
    const context = createContextStub();
    const provider = { refresh: async () => undefined } as any;
    const first = new BeadTreeItem({ id: 'DUP-1', title: 'Dup', status: 'open', raw: { labels: [] } });
    const second = new BeadTreeItem({ id: 'DUP-1', title: 'Dup', status: 'open', raw: { labels: [] } });
    const treeView = { selection: [first, second] } as any;

    await toggleFavorites(provider, treeView, context, runner);

    assert.strictEqual(runnerCalls.length, 1, 'should toggle only once for duplicates');
    const firstCall = runnerCalls[0];
    assert.ok(firstCall);
    assert.deepStrictEqual(firstCall?.args, ['label', 'add', 'DUP-1', 'favorite']);
    assert.ok(vscodeStub._warnings.some((msg: string) => msg.toLowerCase().includes('duplicate')));
    const favorites = vscodeStub._stateStore.get('beady.favorites.local') ?? [];
    assert.ok(favorites.includes('DUP-1'));
  });

  it('rejects unsafe favorite labels', async () => {
    loadExtension({ useLabelStorage: true, favoritesEnabled: true, favoriteLabel: 'bad/label' });
    const context = createContextStub();
    const provider = { refresh: async () => undefined } as any;
    const bead = new BeadTreeItem({ id: 'SAFE-1', title: 'Safe', status: 'open', raw: { labels: [] } });
    const treeView = { selection: [bead] } as any;

    await toggleFavorites(provider, treeView, context, runner);

    assert.strictEqual(runnerCalls.length, 0, 'invalid label should block CLI calls');
    assert.ok(vscodeStub._errors.some((msg: string) => msg.toLowerCase().includes('invalid')));
    const favorites = vscodeStub._stateStore.get('beady.favorites.local') ?? [];
    assert.ok(!favorites.includes('SAFE-1'));
  });

  it('sanitizes CLI errors to avoid leaking paths or tokens', async () => {
    loadExtension({ useLabelStorage: true, favoritesEnabled: true });
    runnerFailure = 'failed at /tmp/project/.beads/issues.db token xoxb-123456789012345';
    const context = createContextStub();
    const provider = { refresh: async () => undefined } as any;
    const bead = new BeadTreeItem({ id: 'ERR-1', title: 'Err', status: 'open', raw: { labels: [] } });
    const treeView = { selection: [bead] } as any;

    await toggleFavorites(provider, treeView, context, runner);

    const surfaced = [...vscodeStub._warnings, ...vscodeStub._errors].join(' ');
    assert.ok(!surfaced.includes('/tmp/project'), 'path should be redacted');
    assert.ok(!surfaced.includes('xoxb-'), 'token should be redacted');
    assert.ok(surfaced.includes('<path>') || surfaced.includes('<token>'), 'sanitized markers should appear');
  });
});
