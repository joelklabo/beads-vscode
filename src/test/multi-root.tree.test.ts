import * as assert from 'assert';
import Module = require('module');

function createWorkspaceFolder(name: string, path: string) {
  return {
    name,
    uri: {
      fsPath: path,
      toString: () => `vscode-workspace://${name}`,
    },
  } as any;
}

describe('Workspace selection', () => {
  let moduleAny: any;
  let restoreLoad: any;
  let loadCalls: string[];
  let savedSelection: string | undefined;
  let vscodeStub: any;
  let contextStub: any;
  let BeadsTreeDataProvider: any;

  beforeEach(() => {
    moduleAny = Module as any;
    restoreLoad = moduleAny._load;
    loadCalls = [];
    savedSelection = undefined;

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
      public collapsibleState: number;
      public tooltip?: any;
      constructor(public label?: any, collapsibleState: number = 0) {
        this.collapsibleState = collapsibleState;
      }
    }

    const workspaces = [createWorkspaceFolder('ws1', '/tmp/ws1'), createWorkspaceFolder('ws2', '/tmp/ws2')];
    const watchers: any[] = [];
    const subscriptions: any[] = [];
    const workspaceStateStore = new Map<string, any>();

    vscodeStub = {
      l10n: { t: (m: string, ...args: any[]) => m.replace(/\{(\d+)\}/g, (_match, i) => String(args[Number(i)] ?? `{${i}}`)) },
      env: { language: 'en', clipboard: { writeText: async () => undefined }, openExternal: () => undefined },
      EventEmitter,
      TreeItem,
      MarkdownString: class { constructor(public value = '') {} appendMarkdown(md: string): void { this.value += md; } appendText(text: string): void { this.value += text; } },
      window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        showErrorMessage: () => Promise.resolve(undefined),
        showQuickPick: async (items: any[]) => items[items.length - 1],
        createTreeView: () => ({ selection: [], onDidExpandElement: () => ({ dispose() {} }), onDidCollapseElement: () => ({ dispose() {} }) }),
        createStatusBarItem: () => ({ text: '', tooltip: '', show() {}, hide() {}, dispose() {} }),
      },
      workspace: {
        workspaceFolders: workspaces,
        getConfiguration: () => ({ get: (_key: string, fallback: any) => fallback }),
        getWorkspaceFolder: (resource?: any) => resource ? workspaces.find(w => w.uri.fsPath === resource.uri.fsPath) : workspaces[0],
        createFileSystemWatcher: () => {
          const watcher = {
            onDidChange: (cb: any) => ({ dispose() {} }),
            onDidCreate: (cb: any) => ({ dispose() {} }),
            onDidDelete: (cb: any) => ({ dispose() {} }),
            dispose: () => undefined,
          };
          watchers.push(watcher);
          return watcher;
        },
        onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      },
      commands: { executeCommand: () => undefined },
      Uri: {
        file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
        joinPath: (...parts: any[]) => ({ fsPath: parts.map(p => (typeof p === 'string' ? p : p.fsPath)).join('/') }),
      },
      RelativePattern: class {},
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      StatusBarAlignment: { Left: 1 },
      ThemeIcon: class { constructor(public id: string) {} },
      ThemeColor: class { constructor(public id: string) {} },
    } as any;

    contextStub = {
      subscriptions,
      workspaceState: {
        get: (key: string) => workspaceStateStore.get(key),
        update: async (key: string, value: any) => { workspaceStateStore.set(key, value); },
      },
    } as any;

    moduleAny._load = (request: string, parent: any, isMain: boolean) => {
      if (request === 'vscode') {
        return vscodeStub;
      }
      if (request.endsWith('providers/beads/store') || request.includes('providers/beads/store')) {
        return {
          loadBeads: async (projectRoot: string) => {
            loadCalls.push(projectRoot);
            return {
              items: [{ id: `${projectRoot}-id`, title: `${projectRoot}-title`, raw: {}, status: 'open' }],
              document: { filePath: `${projectRoot}/.beads/issues.db` },
            } as any;
          },
          findBdCommand: async () => 'bd',
        };
      }
      return restoreLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../utils')];
    delete require.cache[require.resolve('../utils/cli')];
    delete require.cache[require.resolve('../utils/workspace')];
    delete require.cache[require.resolve('../providers/beads/store')];
    delete require.cache[require.resolve('../extension')];

    const extension = require('../extension');
    BeadsTreeDataProvider = extension.BeadsTreeDataProvider;
  });

  afterEach(() => {
    const moduleRestore = Module as any;
    moduleRestore._load = restoreLoad;
  });

  it('refreshes all workspaces when selection is all', async () => {
    const provider = new BeadsTreeDataProvider(contextStub);
    await provider.refresh();

    assert.strictEqual(loadCalls.length, 2);
    assert.ok(loadCalls.includes('/tmp/ws1'));
    assert.ok(loadCalls.includes('/tmp/ws2'));
  });

  it('loads only selected workspace and persists selection', async () => {
    const provider = new BeadsTreeDataProvider(contextStub);
    await provider.setActiveWorkspace('vscode-workspace://ws2');

    assert.deepStrictEqual(loadCalls, ['/tmp/ws2']);
    loadCalls = [];

    await provider.refresh();
    assert.deepStrictEqual(loadCalls, ['/tmp/ws2']);
  });

  it('restores saved workspace selection on new provider', async () => {
    let provider = new BeadsTreeDataProvider(contextStub);
    await provider.setActiveWorkspace('vscode-workspace://ws2');

    const extension = require('../extension');
    provider = new extension.BeadsTreeDataProvider(contextStub);
    loadCalls = [];

    await provider.refresh();
    assert.deepStrictEqual(loadCalls, ['/tmp/ws2']);
  });
});
