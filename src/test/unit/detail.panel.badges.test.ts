/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import Module = require('module');

const noop = () => undefined;
const vscodeStub = {
  env: { language: 'en', clipboard: { writeText: async () => undefined } },
  l10n: { t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)] ?? `{${i}}`)) },
  commands: { registerCommand: () => ({ dispose: noop }), executeCommand: noop },
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
    // Remove modules loaded during this stub to avoid leaking partial vscode shapes.
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

describe('detail panel badges and dependency affordance', () => {
  it('renders hero chips and dependency branches with affordance labels', async () => {
    await withVscodeStub(() => {
      const { getBeadDetailHtml } = require('../../views/detail');
      const { buildBeadDetailStrings, getStatusLabels } = require('../../providers/beads/treeDataProvider');

      const root = {
        id: 'BD-10',
        title: 'Detail hero',
        status: 'in_progress',
        assignee: 'Alex',
        raw: {
          priority: 1,
          issue_type: 'feature',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          dependencies: [{ id: 'BD-11', dep_type: 'blocks' }],
        },
      };
      const upstream = { id: 'BD-11', title: 'Upstream work', status: 'open', raw: {} };
      const downstream = {
        id: 'BD-12',
        title: 'Downstream follow-up',
        status: 'blocked',
        externalReferenceId: 'https://example.com/BD-12',
        raw: { dependencies: [{ id: 'BD-10', dep_type: 'blocks' }], external_reference_id: 'https://example.com/BD-12' },
      };

      const html = getBeadDetailHtml(
        root,
        [root, upstream as any, downstream as any],
        { cspSource: 'vscode-resource' } as any,
        'nonce',
        buildBeadDetailStrings(getStatusLabels()),
        'en',
      );

      assert.ok(html.includes('bead-chip status status-in_progress'), 'status chip missing');
      assert.ok(html.includes('bead-chip priority priority-1'), 'priority chip missing');
      assert.ok(html.includes('bead-chip type type-feature'), 'type chip missing');
      assert.ok(html.includes('bead-chip assignee'), 'assignee chip missing');
      assert.ok(html.includes('id="statusBadge"'), 'status badge affordance missing');
      assert.ok(html.includes('data-direction="upstream"'), 'upstream branch missing');
      assert.ok(html.includes('data-direction="downstream"'), 'downstream branch missing');
      assert.ok(html.includes('tree-direction-label'), 'dependency section affordance missing');
      assert.ok(html.includes('data-url="https://example.com/BD-12"'), 'dependency link should carry external url');
      assert.ok(html.includes('handleDepLink'), 'dependency links should wire click handler');
      assert.ok(html.includes('openExternalUrl'), 'external link handler should post openExternalUrl');
    });
  });
});
