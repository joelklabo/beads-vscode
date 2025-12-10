/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

const noop = () => undefined;
const vscodeStub = {
  env: { language: 'en', clipboard: { writeText: async () => undefined } },
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
  commands: {
    registerCommand: () => ({ dispose: noop }),
    executeCommand: noop,
  },
  workspace: {
    getConfiguration: () => ({ get: (_k: string, fallback: any) => fallback }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: noop }),
    onDidChangeWorkspaceFolders: () => ({ dispose: noop }),
  },
  window: {
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    registerWebviewViewProvider: () => ({ dispose: noop }),
    createTreeView: () => ({ selection: [], onDidChangeSelection: () => ({ dispose: noop }) }),
    createStatusBarItem: () => ({ dispose: noop }),
  },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  Uri: { parse: (u: string) => ({ toString: () => u, fsPath: u }), file: (p: string) => ({ fsPath: p, path: p }), joinPath: (base: any) => base },
  EventEmitter: class { private listeners: any[] = []; event = (listener: any) => { this.listeners.push(listener); return { dispose: noop }; }; fire(data: any) { this.listeners.forEach((l) => l(data)); } dispose() { this.listeners = []; } },
  TreeItem: class { constructor(public label?: any, public collapsibleState?: any) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string, public color?: any) {} },
  ThemeColor: class { constructor(public id: string) {} },
  MarkdownString: class { value = ''; appendMarkdown(text: string) { this.value += text; } },
  chat: { createChatParticipant: () => ({ dispose: noop }) },
  StatusBarAlignment: { Left: 1, Right: 2 },
};

const originalLoad = (Module as any)._load;
const withVscodeStub = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  const before = new Set(Object.keys(require.cache));
  let vscodeCacheKey: string | undefined;
  Object.keys(require.cache).forEach((key) => { if (key.includes('vscode')) { delete require.cache[key]; } });
  try {
    vscodeCacheKey = require.resolve('vscode');
    delete require.cache[vscodeCacheKey];
  } catch {
    vscodeCacheKey = undefined;
  }
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };
  try {
    return await fn();
  } finally {
    (Module as any)._load = originalLoad;
    // Remove any modules loaded during this stubbed run so other suites can set up their own stubs.
    for (const key of Object.keys(require.cache)) {
      if (!before.has(key)) {
        delete require.cache[key];
      }
    }
    if (vscodeCacheKey) {
      delete require.cache[vscodeCacheKey];
    }
  }
};

describe('tree badges and affordances', () => {
  it('renders status/priority/assignee codicons in bead rows', async () => {
    await withVscodeStub(() => {
      const { BeadTreeItem } = require('../../providers/beads/items');
      const bead = {
        id: 'BD-1',
        title: 'Badge coverage',
        status: 'in_progress',
        assignee: 'Taylor Swift',
        description: 'Implement chips',
        issueType: 'feature',
        priority: 1,
        updatedAt: new Date().toISOString(),
        raw: { priority: 1 },
      } as any;

      const item = new BeadTreeItem(bead, false);

      assert.ok((item.description || '').includes('$(play)'), 'missing status codicon');
      assert.ok((item.description || '').includes('$(arrow-up)'), 'missing priority codicon');
      assert.ok((item.description || '').includes('$(person)'), 'missing assignee codicon');
      assert.strictEqual((item.iconPath as any)?.id, 'sparkle', 'item icon should follow issue type');
    });
  });

  it('shows collapse chevrons on status sections', async () => {
    await withVscodeStub(() => {
      const { StatusSectionItem } = require('../../providers/beads/items');
      const sectionCollapsed = new StatusSectionItem('open', [], true);
      const sectionExpanded = new StatusSectionItem('open', [], false);

      assert.ok(String(sectionCollapsed.label).startsWith('$(chevron-right)'), 'collapsed section should use chevron-right');
      assert.ok(String(sectionExpanded.label).startsWith('$(chevron-down)'), 'expanded section should use chevron-down');
    });
  });
});
